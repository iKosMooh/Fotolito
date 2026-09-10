import sharp from 'sharp';
import ImageTracer from 'imagetracerjs';
import { measure, sealSeams } from '../../lib/svgTools';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Recorte em coordenadas relativas: "x,y,largura,altura" de 0 a 1. */
function parseCrop(value) {
  if (typeof value !== 'string' || !value) return null;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = parts;
  if (w <= 0.02 || h <= 0.02) return null;
  return {
    x: Math.min(Math.max(x, 0), 0.98),
    y: Math.min(Math.max(y, 0), 0.98),
    w: Math.min(w, 1 - Math.min(Math.max(x, 0), 0.98)),
    h: Math.min(h, 1 - Math.min(Math.max(y, 0), 0.98)),
  };
}

function rgbToHex(svg) {
  return svg.replace(/rgb\((\d+),(\d+),(\d+)\)/g, (_, r, g, b) =>
    '#' + [r, g, b].map((c) => Number(c).toString(16).padStart(2, '0')).join('')
  );
}

/**
 * Pre-processa a imagem e vetoriza mantendo cores e forma.
 * Sharp limpa os artefatos de compressao e entrega a matriz RGBA crua;
 * o ImageTracer separa a paleta em camadas e ajusta as curvas de Bezier.
 */
async function processAndVectorize(buffer, options) {
  const source = sharp(buffer, { failOn: 'none' }).rotate();
  const meta = await source.metadata();

  let pipeline = source;

  // 0. Recorte: o fundo de uma foto real responde pela maior parte dos
  // vetores inuteis. Vetorizar so o recorte corta caminho e peso.
  const full = { width: meta.width || 0, height: meta.height || 0 };
  const crop = options.crop;
  if (crop && full.width && full.height) {
    const left = Math.round(crop.x * full.width);
    const top = Math.round(crop.y * full.height);
    const width = Math.round(crop.w * full.width);
    const height = Math.round(crop.h * full.height);
    if (width >= 8 && height >= 8) {
      pipeline = pipeline.extract({
        left: Math.min(left, full.width - width),
        top: Math.min(top, full.height - height),
        width,
        height,
      });
      full.width = width;
      full.height = height;
    }
  }

  pipeline = pipeline.resize({
    width: options.detail,
    height: options.detail,
    fit: 'inside',
    withoutEnlargement: true,
    kernel: 'lanczos3',
  });

  // 1. Pre-processamento: suaviza ruido de JPG antes da leitura dos pixels.
  if (options.denoise > 0) pipeline = pipeline.median(3);
  if (options.smooth > 0) pipeline = pipeline.blur(options.smooth);

  // Modo de cor. Em preto e branco o corte acontece aqui, nos pixels: o tracador
  // recebe duas cores chapadas e devolve contornos limpos, sem meio-tom.
  const pipelineClone = pipeline.clone();

  const { data, info } = await pipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Modo de cor direto na matriz RGBA: greyscale() do Sharp devolve um canal so
  // e o tracador espera quatro. Aqui o alfa fica intacto e o corte e' exato.
  if (options.mode !== 'color') {
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const value = options.mode === 'mono' ? (luma < options.level ? 0 : 255) : Math.round(luma);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
  }

  // Em preto e branco e em cinza a paleta e' explicita. Deixar o k-means decidir
  // faz o transparente e o preto cairem no mesmo grupo e o fundo vira uma mancha.
  const hasAlpha = (() => {
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
    return false;
  })();

  let palette = null;
  if (options.mode === 'mono') {
    palette = [
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
    ];
  } else if (options.mode === 'gray') {
    let lo = 255;
    let hi = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      if (data[i] < lo) lo = data[i];
      if (data[i] > hi) hi = data[i];
    }
    if (hi <= lo) {
      lo = 0;
      hi = 255;
    }
    const steps = Math.max(2, options.colors);
    palette = Array.from({ length: steps }, (_, k) => {
      const v = Math.round(lo + ((hi - lo) * k) / (steps - 1));
      return { r: v, g: v, b: v, a: 255 };
    });
  }
  if (palette && hasAlpha) palette.push({ r: 0, g: 0, b: 0, a: 0 });

  // Cor dominante da imagem já recortada, para servir de chapa de fundo.
  let backdrop = null;
  if (options.plate) {
    try {
      const { dominant, isOpaque } = await sharp(await pipelineClone.png().toBuffer()).stats();
      if (isOpaque && dominant) {
        let { r, g, b } = dominant;
        if (options.mode !== 'color') {
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          const value = options.mode === 'mono' ? (luma < options.level ? 0 : 255) : Math.round(luma);
          r = g = b = value;
        }
        backdrop = '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
      }
    } catch {
      backdrop = null;
    }
  }

  // 2 a 5. Quantizacao, separacao em camadas, contorno e ajuste de curvas.
  const traced = ImageTracer.imagedataToSVG(
    { width: info.width, height: info.height, data: new Uint8ClampedArray(data) },
    {
      ...(palette ? { pal: palette } : {}),
      numberofcolors: options.mode === 'mono' ? 2 : options.colors,
      colorquantcycles: options.quantcycles,
      pathomit: options.pathomit,
      ltres: options.ltres,
      qtres: options.qtres,
      rightangleenhance: options.corners,
      linefilter: options.corners,
      blurradius: 0,
      blurdelta: 20,
      roundcoords: 2,
      strokewidth: options.seal > 0 ? options.seal : 1,
      viewbox: true,
      desc: false,
    }
  );

  const outW = full.width || info.width;
  const outH = full.height || info.height;

  // Chapa de fundo: numa imagem opaca, qualquer vazamento entre formas mostra a cor
  // dominante em vez do branco da página. Custa uma tag e some com o pontilhado claro.
  const base =
    options.plate && backdrop && !hasAlpha
      ? `<rect width="${info.width}" height="${info.height}" fill="${backdrop}"/>`
      : '';

  let svg = rgbToHex(traced).replace(
    /^<svg[^>]*>/,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" ` +
      `viewBox="0 0 ${info.width} ${info.height}" shape-rendering="geometricPrecision" ` +
      `fill-rule="nonzero" stroke-linejoin="round" stroke-linecap="round">${base}`
  );

  svg = sealSeams(svg, options.seal);

  return {
    svg,
    stats: {
      ...measure(svg),
      traceWidth: info.width,
      traceHeight: info.height,
      sourceWidth: outW,
      sourceHeight: outH,
      format: meta.format,
      mode: options.mode,
      sealed: options.seal > 0,
      plated: Boolean(base),
    },
  };
}

export async function POST(request) {
  const started = Date.now();
  try {
    const form = await request.formData();
    const file = form.get('image');

    if (!file || typeof file === 'string') {
      return Response.json({ error: 'Escolha uma imagem para vetorizar.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: 'A imagem passa de 12 MB. Reduza o arquivo e envie de novo.' }, { status: 413 });
    }
    if (file.type && !ACCEPTED.includes(file.type)) {
      return Response.json({ error: `Formato ${file.type} nao e aceito. Use PNG, JPG, WebP ou AVIF.` }, { status: 415 });
    }

    const options = {
      colors: Math.round(clamp(form.get('colors'), 2, 128, 24)),
      quantcycles: Math.round(clamp(form.get('quantcycles'), 1, 10, 3)),
      pathomit: Math.round(clamp(form.get('pathomit'), 0, 64, 8)),
      ltres: clamp(form.get('ltres'), 0.01, 10, 1),
      qtres: clamp(form.get('qtres'), 0.01, 10, 1),
      smooth: clamp(form.get('smooth'), 0, 4, 0.4),
      denoise: Math.round(clamp(form.get('denoise'), 0, 1, 0)),
      detail: Math.round(clamp(form.get('detail'), 120, 1600, 800)),
      corners: form.get('corners') !== 'false',
      crop: parseCrop(form.get('crop')),
      seal: clamp(form.get('seal'), 0, 3, 0.6),
      plate: form.get('plate') !== 'false',
      mode: ['color', 'gray', 'mono'].includes(form.get('mode')) ? form.get('mode') : 'color',
      level: Math.round(clamp(form.get('level'), 1, 254, 128)),
    };

    const buffer = Buffer.from(await file.arrayBuffer());
    const { svg, stats } = await processAndVectorize(buffer, options);

    return Response.json({
      svg,
      stats: {
        ...stats,
        sourceBytes: file.size,
        ms: Date.now() - started,
        name: (file.name || 'imagem').replace(/\.[^.]+$/, ''),
      },
    });
  } catch (error) {
    console.error('[convert]', error);
    return Response.json(
      { error: 'A vetorizacao falhou. O arquivo pode estar corrompido ou nao ser uma imagem.' },
      { status: 500 }
    );
  }
}
