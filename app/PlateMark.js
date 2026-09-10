'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const W = 360;
const H = 300;
const CELL = 12;

// Três chapas de tinta: a mesma marca separada em amarelo, magenta e azul.
const PLATES = [
  {
    id: 'yel',
    color: '#ffc400',
    d: 'M 62 96 C 86 40 168 24 226 44 C 292 66 320 128 300 190 C 282 246 214 274 152 262 C 84 248 40 152 62 96 Z',
  },
  {
    id: 'mag',
    color: '#ff2e7e',
    d: 'M 118 108 C 138 74 196 66 228 96 C 262 128 254 186 216 208 C 176 232 128 214 114 176 C 104 148 106 128 118 108 Z',
  },
  {
    id: 'blu',
    color: '#1b3be8',
    d: 'M 168 130 C 186 118 210 128 214 150 C 218 174 198 190 178 182 C 158 174 152 142 168 130 Z',
  },
];

// Nós e alças da chapa magenta — os pontos de controle das curvas de Bézier.
const NODES = [
  { x: 118, y: 108, handles: [[106, 128], [138, 74]] },
  { x: 228, y: 96, handles: [[196, 66], [262, 128]] },
  { x: 216, y: 208, handles: [[254, 186], [176, 232]] },
  { x: 114, y: 176, handles: [[128, 214], [104, 148]] },
];

// A grade tem que mostrar a mesma composicao das chapas: amarelo e magenta
// se sobrepoem em multiply, o azul e' a chapa de cima e cobre as outras.
function multiplyHex(a, b) {
  const pair = (i) => Math.round((parseInt(a.slice(i, i + 2), 16) * parseInt(b.slice(i, i + 2), 16)) / 255);
  return '#' + [1, 3, 5].map((i) => pair(i).toString(16).padStart(2, '0')).join('');
}

// A varredura anda da esquerda para a direita: atrás dela a marca já virou curva.
const CYCLE = 11000;
function sweep(t) {
  const p = (t % CYCLE) / CYCLE;
  if (p < 0.06) return 0;
  if (p < 0.46) return ease((p - 0.06) / 0.4);
  if (p < 0.62) return 1;
  if (p < 0.94) return 1 - ease((p - 0.62) / 0.32);
  return 0;
}
function ease(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export default function PlateMark() {
  const probeRef = useRef(null);
  const vectorRef = useRef(null);
  const pixelRef = useRef(null);
  const lineRef = useRef(null);
  const [cells, setCells] = useState([]);

  useEffect(() => {
    const place = (x) => {
      vectorRef.current?.setAttribute('x', String(x - W));
      pixelRef.current?.setAttribute('x', String(x));
      if (lineRef.current) {
        lineRef.current.setAttribute('x1', String(x));
        lineRef.current.setAttribute('x2', String(x));
        lineRef.current.style.opacity = x > W - 2 || x < 2 ? '0' : '1';
      }
    };

    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (still.matches) {
      place(W * 0.54);
      return undefined;
    }

    let frame;
    const start = performance.now();
    const tick = (now) => {
      place(sweep(now - start) * W);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const svg = probeRef.current;
    if (!svg) return;
    const point = svg.createSVGPoint();
    const paths = PLATES.map((plate) => svg.querySelector(`#probe-${plate.id}`));
    const found = [];

    for (let y = 0; y < H; y += CELL) {
      for (let x = 0; x < W; x += CELL) {
        point.x = x + CELL / 2;
        point.y = y + CELL / 2;
        let color = null;
        paths.forEach((path, index) => {
          if (!path || !path.isPointInFill(point)) return;
          const plate = PLATES[index];
          color = plate.id === 'blu' || !color ? plate.color : multiplyHex(color, plate.color);
        });
        if (color) found.push({ x, y, color });
      }
    }
    setCells(found);
  }, []);

  const rects = useMemo(
    () =>
      cells.map((cell) => (
        <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width={CELL} height={CELL} fill={cell.color} />
      )),
    [cells]
  );

  return (
    <figure className="plate" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A mesma marca, metade em pixels e metade em curvas de Bézier.">
        <defs>
          <clipPath id="clip-vector" clipPathUnits="userSpaceOnUse">
            <rect ref={vectorRef} x={-W} y={0} width={W} height={H} />
          </clipPath>
          <clipPath id="clip-pixel" clipPathUnits="userSpaceOnUse">
            <rect ref={pixelRef} x={0} y={0} width={W} height={H} />
          </clipPath>
        </defs>

        <g clipPath="url(#clip-pixel)" shapeRendering="crispEdges">{rects}</g>

        <g clipPath="url(#clip-vector)">
          {PLATES.map((plate) => (
            <path
              key={plate.id}
              className={plate.id === 'blu' ? undefined : 'multiply'}
              d={plate.d}
              fill={plate.color}
            />
          ))}
          <g>
            {NODES.map((node) =>
              node.handles.map((handle, i) => (
                <g key={`${node.x}-${i}`}>
                  <line className="handle" x1={node.x} y1={node.y} x2={handle[0]} y2={handle[1]} />
                  <circle className="handle-dot" cx={handle[0]} cy={handle[1]} r="2.4" />
                </g>
              ))
            )}
            {NODES.map((node) => (
              <rect key={`n-${node.x}`} className="node" x={node.x - 4} y={node.y - 4} width="8" height="8" />
            ))}
          </g>
        </g>

        <line ref={lineRef} className="scanline" x1="0" y1="0" x2="0" y2={H} style={{ opacity: 0 }} />
      </svg>

      <figcaption className="plate-legend">
        <span>
          esquerda <b>curvas</b>
        </span>
        <span className="mono">M · C · Z</span>
        <span>
          <b>pixels</b> direita
        </span>
      </figcaption>

      {/* trilhas ocultas usadas só para descobrir quais pixels caem dentro de cada chapa */}
      <svg
        ref={probeRef}
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden="true"
        focusable="false"
        style={{ position: 'absolute', left: 0, bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      >
        {PLATES.map((plate) => (
          <path key={plate.id} id={`probe-${plate.id}`} d={plate.d} />
        ))}
      </svg>
    </figure>
  );
}
