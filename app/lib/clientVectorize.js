'use client';

/**
 * Pipeline de vetorização rodando 100% no navegador (Canvas 2D + ImageTracer).
 *
 * Existe porque a Netlify roda /api/convert como função serverless e o sharp
 * (binário nativo) é frágil nesse ambiente — binário errado para a plataforma,
 * limite de payload/tempo de execução da função, cold start etc. Fazendo o
 * mesmo trabalho com Canvas + ImageData, a conversão não depende de servidor
 * nenhum. A rota /api/convert continua existindo como fallback (ver Desk.js).
 */

import ImageTracer from 'imagetracerjs';
import { optimize } from 'svgo/browser';

const MAX_BYTES = 12 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function rgbToHex(svg) {
  return svg.replace(/rgb\((\d+),(\d+),(\d+)\)/g, (_, r, g, b) =>
    '#' + [r, g, b].map((c) => Number(c).toString(16).padStart(2, '0')).join('')
  );
}

function sealSeams(svg, width) {
  if (!(width > 0)) {
    return svg.replace(/\s(?:stroke|stroke-width)="[^"]*"/g, '');
  }
  const w = Number(width.toFixed(2));
  return svg.replace(/<path\b[^>]*>/g, (tag) => {
    const fill = tag.match(/fill="([^"]+)"/);
    if (!fill) return tag;
    return tag
      .replace(/\sstroke="[^"]*"/g, '')
      .replace(/\sstroke-width="[^"]*"/g, '')
      .replace(/<path\b/, `<path stroke="${fill[1]}" stroke-width="${w}"`);
  });
}

async function gzipBytes(text) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return buffer.byteLength;
}

async function measure(svg) {
  return {
    paths: (svg.match(/<path/g) || []).length,
    nodes: (svg.match(/[MLQCAZmlqcaz]/g) || []).length,
    colors: new Set(svg.match(/fill="[^"]+"/g) || []).size,
    bytes: new TextEncoder().encode(svg).length,
    gzipBytes: await gzipBytes(svg),
  };
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return { canvas, ctx };
}

/** Downscale em passos (metade a metade) evita o serrilhado de um drawImage único e agressivo. */
function drawScaled(source, srcW, srcH, dstW, dstH) {
  let curW = srcW;
  let curH = srcH;
  let curSource = source;
  while (curW / 2 >= dstW && curH / 2 >= dstH) {
    const nextW = Math.round(curW / 2);
    const nextH = Math.round(curH / 2);
    const { canvas, ctx } = makeCanvas(nextW, nextH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(curSource, 0, 0, curW, curH, 0, 0, nextW, nextH);
    curSource = canvas;
    curW = nextW;
    curH = nextH;
  }
  const { canvas, ctx } = makeCanvas(dstW, dstH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(curSource, 0, 0, curW, curH, 0, 0, dstW, dstH);
  return canvas;
}

function fitInside(w, h, max) {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = Math.min(max / w, max / h);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/** Filtro de mediana 3x3 nos canais R, G e B — replica o sharp .median(3) usado para JPG ruidoso. */
function medianFilter3(data, width, height) {
  const src = data.slice();
  const at = (x, y, c) => src[(y * width + x) * 4 + c];
  const window = new Array(9);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -1; dx <= 1; dx++) {
            const nx = Math.min(width - 1, Math.max(0, x + dx));
            window[k++] = at(nx, ny, c);
          }
        }
        window.sort((a, b) => a - b);
        data[(y * width + x) * 4 + c] = window[4];
      }
    }
  }
}

/** Aproxima o sharp .stats().dominant: histograma grosseiro e o balde mais frequente. */
function dominantColor(data) {
  let isOpaque = true;
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 255) isOpaque = false;
    if (data[i + 3] < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const entry = buckets.get(key);
    if (entry) {
      entry.count++;
      entry.r += r;
      entry.g += g;
      entry.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }
  let best = null;
  for (const entry of buckets.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  if (!best) return { dominant: null, isOpaque };
  return {
    dominant: {
      r: Math.round(best.r / best.count),
      g: Math.round(best.g / best.count),
      b: Math.round(best.b / best.count),
    },
    isOpaque,
  };
}

function parseCropOption(crop) {
  if (!crop) return null;
  const { x, y, w, h } = crop;
  if (![x, y, w, h].every(Number.isFinite)) return null;
  if (w <= 0.02 || h <= 0.02) return null;
  const cx = Math.min(Math.max(x, 0), 0.98);
  const cy = Math.min(Math.max(y, 0), 0.98);
  return { x: cx, y: cy, w: Math.min(w, 1 - cx), h: Math.min(h, 1 - cy) };
}

async function processAndVectorize(file, options, format) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() =>
    createImageBitmap(file)
  );

  const full = { width: bitmap.width, height: bitmap.height };
  let cropSource = bitmap;
  let cropW = full.width;
  let cropH = full.height;

  const crop = options.crop;
  if (crop && full.width && full.height) {
    const left = Math.round(crop.x * full.width);
    const top = Math.round(crop.y * full.height);
    const width = Math.round(crop.w * full.width);
    const height = Math.round(crop.h * full.height);
    if (width >= 8 && height >= 8) {
      const { canvas, ctx } = makeCanvas(width, height);
      ctx.drawImage(
        bitmap,
        Math.min(left, full.width - width),
        Math.min(top, full.height - height),
        width,
        height,
        0,
        0,
        width,
        height
      );
      cropSource = canvas;
      cropW = width;
      cropH = height;
      full.width = width;
      full.height = height;
    }
  }

  const target = fitInside(cropW, cropH, options.detail);
  let workCanvas = drawScaled(cropSource, cropW, cropH, target.width, target.height);
  let ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  let imageData = ctx.getImageData(0, 0, target.width, target.height);
  let data = imageData.data;

  if (options.denoise > 0) {
    medianFilter3(data, target.width, target.height);
  }

  if (options.smooth > 0) {
    const denoised = makeCanvas(target.width, target.height);
    denoised.ctx.putImageData(imageData, 0, 0);
    const blurred = makeCanvas(target.width, target.height);
    blurred.ctx.filter = `blur(${options.smooth}px)`;
    blurred.ctx.drawImage(denoised.canvas, 0, 0);
    imageData = blurred.ctx.getImageData(0, 0, target.width, target.height);
    data = imageData.data;
  }

  const info = { width: target.width, height: target.height };

  let backdrop = null;
  if (options.plate) {
    const { dominant, isOpaque } = dominantColor(data);
    if (isOpaque && dominant) {
      let { r, g, b } = dominant;
      if (options.mode !== 'color') {
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const value = options.mode === 'mono' ? (luma < options.level ? 0 : 255) : Math.round(luma);
        r = g = b = value;
      }
      backdrop = '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
    }
  }

  if (options.mode !== 'color') {
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const value = options.mode === 'mono' ? (luma < options.level ? 0 : 255) : Math.round(luma);
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
  }

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
      ...(await measure(svg)),
      traceWidth: info.width,
      traceHeight: info.height,
      sourceWidth: outW,
      sourceHeight: outH,
      format,
      mode: options.mode,
      sealed: options.seal > 0,
      plated: Boolean(base),
    },
  };
}

/**
 * Equivalente ao handler de /api/convert, mas local. Recebe os mesmos
 * parâmetros que o Desk.js hoje monta para o FormData da rota.
 */
export async function vectorizeInBrowser(file, rawParams, crop) {
  if (typeof window === 'undefined' || typeof createImageBitmap !== 'function') {
    throw new Error('Este navegador não suporta a vetorização local.');
  }
  if (!file) throw new Error('Escolha uma imagem para vetorizar.');
  if (file.size > MAX_BYTES) {
    throw new Error('A imagem passa de 12 MB. Reduza o arquivo e envie de novo.');
  }
  if (file.type && !ACCEPTED.includes(file.type)) {
    throw new Error(`Formato ${file.type} nao e aceito. Use PNG, JPG, WebP ou AVIF.`);
  }

  const started = Date.now();
  const options = {
    colors: Math.round(clamp(rawParams.colors, 2, 128, 24)),
    quantcycles: Math.round(clamp(rawParams.quantcycles, 1, 10, 3)),
    pathomit: Math.round(clamp(rawParams.pathomit, 0, 64, 8)),
    ltres: clamp(rawParams.tol, 0.01, 10, 1),
    qtres: clamp(rawParams.tol, 0.01, 10, 1),
    smooth: clamp(rawParams.smooth, 0, 4, 0.4),
    denoise: rawParams.denoise ? 1 : 0,
    detail: Math.round(clamp(rawParams.detail, 120, 1600, 800)),
    corners: Boolean(rawParams.corners),
    crop: parseCropOption(crop),
    seal: clamp(rawParams.seal, 0, 3, 0.6),
    plate: Boolean(rawParams.plate),
    mode: ['color', 'gray', 'mono'].includes(rawParams.mode) ? rawParams.mode : 'color',
    level: Math.round(clamp(rawParams.level, 1, 254, 128)),
  };

  const format = (file.type || '').replace('image/', '') || undefined;
  const { svg, stats } = await processAndVectorize(file, options, format);

  return {
    svg,
    stats: {
      ...stats,
      sourceBytes: file.size,
      ms: Date.now() - started,
      name: (file.name || 'imagem').replace(/\.[^.]+$/, ''),
    },
  };
}

/** Equivalente ao handler de /api/optimize, mas local (svgo/browser, sem Node). */
export async function compressInBrowser(svg, { precision = 1, merge = true } = {}) {
  if (typeof svg !== 'string' || !svg.includes('<svg')) {
    throw new Error('Nada para compactar. Vetorize uma imagem primeiro.');
  }

  const started = Date.now();
  const before = await measure(svg);
  const result = optimize(svg, {
    multipass: true,
    js2svg: { indent: 0, pretty: false },
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            removeViewBox: false,
            cleanupNumericValues: { floatPrecision: Math.min(Math.max(Number(precision) || 1, 0), 4) },
            convertPathData: {
              floatPrecision: Math.min(Math.max(Number(precision) || 1, 0), 4),
              transformPrecision: Math.min(Math.max(Number(precision) || 1, 0), 4),
              makeArcs: false,
            },
          },
        },
      },
      'removeUnusedNS',
      'removeUselessStrokeAndFill',
      ...(merge !== false ? [{ name: 'mergePaths', params: { force: true, noSpaceAfterFlags: true } }] : []),
    ],
  });
  const out = result.data;
  const after = await measure(out);

  return { svg: out, before, after, ms: Date.now() - started };
}
