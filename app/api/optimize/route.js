import { compress, measure } from '../../lib/svgTools';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_CHARS = 24 * 1024 * 1024;

export async function POST(request) {
  const started = Date.now();
  try {
    const { svg, precision, merge } = await request.json();

    if (typeof svg !== 'string' || !svg.includes('<svg')) {
      return Response.json({ error: 'Nada para compactar. Vetorize uma imagem primeiro.' }, { status: 400 });
    }
    if (svg.length > MAX_CHARS) {
      return Response.json({ error: 'Esse SVG é grande demais para compactar aqui.' }, { status: 413 });
    }

    const before = measure(svg);
    const out = compress(svg, {
      precision: Math.min(Math.max(Number(precision) || 1, 0), 4),
      merge: merge !== false,
    });
    const after = measure(out);

    return Response.json({
      svg: out,
      before,
      after,
      ms: Date.now() - started,
    });
  } catch (error) {
    console.error('[optimize]', error);
    return Response.json({ error: 'A compactação falhou. O SVG pode estar malformado.' }, { status: 500 });
  }
}
