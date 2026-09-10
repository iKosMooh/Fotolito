import { gzipSync } from 'node:zlib';
import { optimize } from 'svgo';

/** Conta o que decide o peso e o tempo de render de um SVG. */
export function measure(svg) {
  return {
    paths: (svg.match(/<path/g) || []).length,
    nodes: (svg.match(/[MLQCAZmlqcaz]/g) || []).length,
    colors: new Set(svg.match(/fill="[^"]+"/g) || []).size,
    bytes: Buffer.byteLength(svg, 'utf8'),
    gzipBytes: gzipSync(Buffer.from(svg, 'utf8'), { level: 9 }).length,
  };
}

/**
 * Sela as emendas entre formas vizinhas.
 *
 * Duas formas da mesma cor que dividem a borda exata recebem, cada uma, opacidade
 * parcial do anti-aliasing. As duas metades não somam 100% e o fundo vaza na junção
 * como pontinhos claros. Um contorno fino da própria cor de preenchimento cobre a
 * junta; largura zero remove os contornos e devolve um arquivo menor.
 */
export function sealSeams(svg, width) {
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

/**
 * Otimiza o XML: precisão decimal menor, atributos inúteis fora e caminhos de
 * mesma cor fundidos. A fusão também apaga as bordas internas entre formas
 * vizinhas, que é a mesma origem dos pontinhos.
 */
export function compress(svg, { precision = 1, merge = true } = {}) {
  const result = optimize(svg, {
    multipass: true,
    js2svg: { indent: 0, pretty: false },
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            removeViewBox: false,
            cleanupNumericValues: { floatPrecision: precision },
            convertPathData: {
              floatPrecision: precision,
              transformPrecision: precision,
              makeArcs: false,
            },
          },
        },
      },
      'removeUnusedNS',
      'removeUselessStrokeAndFill',
      ...(merge ? [{ name: 'mergePaths', params: { force: true, noSpaceAfterFlags: true } }] : []),
    ],
  });
  return result.data;
}
