'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { putHandoff } from '../lib/handoff';

const MAX_SIDE = 5000;


const BGS = [
  { key: 'none', label: 'Transparente' },
  { key: '#ffffff', label: 'Branco' },
  { key: '#14131a', label: 'Preto' },
];

const DEFAULTS = { hardness: 0, shift: 0, feather: 0, decon: true };

function mb(n) {
  return `${(n / 1048576).toFixed(n > 104857600 ? 0 : 1)} MB`;
}

// ---------- operações na máscara (Uint8Array, 1 byte por pixel) ----------

function morph(src, w, h, r, grow) {
  // máximo (expande) ou mínimo (encolhe) num quadrado de raio r, separável
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  const pick = grow ? Math.max : Math.min;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = src[row + x];
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, src[row + k]);
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = tmp[y * w + x];
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, tmp[k * w + x]);
      out[y * w + x] = v;
    }
  }
  return out;
}

function boxBlur(src, w, h, r) {
  // duas passadas de média móvel ≈ desfoque gaussiano, custo independente do raio
  const pass = (input) => {
    const tmp = new Uint8Array(input.length);
    const out = new Uint8Array(input.length);
    const span = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += input[row + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        tmp[row + x] = sum / span;
        sum += input[row + Math.min(w - 1, x + r + 1)] - input[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / span;
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  };
  return pass(pass(src));
}

function adjustMask(raw, w, h, p) {
  let a = raw;
  if (p.hardness > 0) {
    const k = 1 + p.hardness / 12;
    a = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) a[i] = Math.max(0, Math.min(255, (raw[i] - 128) * k + 128));
  }
  if (p.shift !== 0) a = morph(a, w, h, Math.abs(p.shift), p.shift > 0);
  if (p.feather > 0) a = boxBlur(a, w, h, p.feather);
  return a;
}

// estima a cor do assunto perto da borda: desfoca só os pixels certamente do assunto (o canvas
// desfoca pré-multiplicado, então a cor lida já é a média do assunto, sem o fundo misturado)
function foregroundColors(orig, mask, w, h) {
  const a = document.createElement('canvas');
  a.width = w;
  a.height = h;
  const actx = a.getContext('2d');
  if (!('filter' in actx)) return null;
  const hard = new ImageData(new Uint8ClampedArray(orig.data), w, h);
  for (let i = 0; i < mask.length; i++) hard.data[i * 4 + 3] = mask[i] >= 230 ? 255 : 0;
  actx.putImageData(hard, 0, 0);
  const b = document.createElement('canvas');
  b.width = w;
  b.height = h;
  const bctx = b.getContext('2d', { willReadFrequently: true });
  bctx.filter = 'blur(6px)';
  bctx.drawImage(a, 0, 0);
  bctx.filter = 'none';
  // segunda camada mais larga por baixo cobre bordas mais distantes do assunto sólido
  bctx.globalCompositeOperation = 'destination-over';
  bctx.filter = 'blur(18px)';
  bctx.drawImage(a, 0, 0);
  bctx.filter = 'none';
  return bctx.getImageData(0, 0, w, h);
}

export default function Remover() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dims, setDims] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | loading | running | ready
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [params, setParams] = useState(DEFAULTS);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const [tool, setTool] = useState('none'); // none | erase | keep
  const [brush, setBrush] = useState(30);
  const [strokes, setStrokes] = useState(0);
  const [bg, setBg] = useState('none');
  const [customBg, setCustomBg] = useState('#ffc400');
  const [peek, setPeek] = useState(false);
  const [over, setOver] = useState(false);
  const [cursor, setCursor] = useState(null);

  const workerRef = useRef(null);
  const inputRef = useRef(null);
  const outRef = useRef(null);
  const work = useRef({}); // dados pesados fora do estado do React
  const strokeRef = useRef(null);
  const filesSeen = useRef({});

  useEffect(
    () => () => {
      workerRef.current?.terminate();
    },
    []
  );
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  // ---------- composição final ----------

  const compose = useCallback((rx = 0, ry = 0, rw, rh) => {
    const W = work.current;
    if (!W.adj || !outRef.current) return;
    const { w, h, orig, adj, fg, editCtx, outData, ctx } = W;
    rw = rw ?? w;
    rh = rh ?? h;
    const x0 = Math.max(0, Math.floor(rx));
    const y0 = Math.max(0, Math.floor(ry));
    const x1 = Math.min(w, Math.ceil(rx + rw));
    const y1 = Math.min(h, Math.ceil(ry + rh));
    if (x1 <= x0 || y1 <= y0) return;
    const edit = editCtx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const o = orig.data;
    const d = outData.data;
    const useFg = W.decon && fg;
    let e = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++, e += 4) {
        const i = y * w + x;
        const p = i * 4;
        // pincel: alfa do traço = cobertura, vermelho = restaurar (255) ou apagar (0)
        const cov = edit[e + 3] / 255;
        const a = adj[i] * (1 - cov) + edit[e] * cov;
        if (useFg && a < 250 && a > 0 && fg.data[p + 3] > 0) {
          const t = a / 255;
          d[p] = o[p] * t + fg.data[p] * (1 - t);
          d[p + 1] = o[p + 1] * t + fg.data[p + 1] * (1 - t);
          d[p + 2] = o[p + 2] * t + fg.data[p + 2] * (1 - t);
        } else {
          d[p] = o[p];
          d[p + 1] = o[p + 1];
          d[p + 2] = o[p + 2];
        }
        d[p + 3] = a;
      }
    }
    ctx.putImageData(outData, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }, []);

  const rebuildMask = useCallback(
    (p) => {
      const W = work.current;
      if (!W.raw) return;
      W.adj = adjustMask(W.raw, W.w, W.h, p);
      W.decon = p.decon;
      W.fg = p.decon ? foregroundColors(W.orig, W.adj, W.w, W.h) : null;
      W.built = p;
      compose();
    },
    [compose]
  );

  // ajustes com pequeno atraso: em foto grande cada passada custa algumas centenas de ms
  useEffect(() => {
    if (phase !== 'ready' || work.current.built === params) return undefined;
    const t = setTimeout(() => rebuildMask(params), 120);
    return () => clearTimeout(t);
  }, [params, phase, rebuildMask]);

  // ---------- entrada ----------

  const accept = async (next) => {
    if (!next) return;
    if (!next.type.startsWith('image/')) {
      setError('Esse arquivo não é uma imagem. Use PNG, JPG, WebP ou AVIF.');
      return;
    }
    setError('');
    setPhase('idle');
    setMeta(null);
    setStrokes(0);
    try {
      const bmp = await createImageBitmap(next);
      const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * k);
      const h = Math.round(bmp.height * k);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cctx = c.getContext('2d', { willReadFrequently: true });
      cctx.drawImage(bmp, 0, 0, w, h);
      bmp.close?.();
      const edit = document.createElement('canvas');
      edit.width = w;
      edit.height = h;
      work.current = {
        w,
        h,
        orig: cctx.getImageData(0, 0, w, h),
        source: k < 1 ? await new Promise((r) => c.toBlob(r, 'image/png')) : next,
        editCtx: edit.getContext('2d', { willReadFrequently: true }),
        strokes: [],
      };
      setFile(next);
      setDims({ w, h, scaled: k < 1, ow: Math.round(w / k), oh: Math.round(h / k) });
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(next);
      });
      run();
    } catch {
      setError('Não foi possível abrir essa imagem. Tente exportar como PNG ou JPG.');
    }
  };

  useEffect(() => {
    const onPaste = (event) => {
      const item = [...(event.clipboardData?.files || [])][0];
      if (item) accept(item);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // ---------- inferência ----------

  const run = () => {
    const W = work.current;
    if (!W.source) return;
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('./bgWorker.js', import.meta.url), { type: 'module' });
    }
    const worker = workerRef.current;
    filesSeen.current = {};
    setPhase('loading');
    setProgress(null);
    setStatus('Preparando');
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        filesSeen.current[m.file] = m;
        const all = Object.values(filesSeen.current);
        setProgress({
          loaded: all.reduce((s, f) => s + f.loaded, 0),
          total: all.reduce((s, f) => s + f.total, 0),
        });
      } else if (m.type === 'status') {
        setStatus(m.text);
        if (m.text.startsWith('Isolando')) setPhase('running');
      } else if (m.type === 'done') {
        const cur = work.current;
        cur.raw = m.mask;
        const out = outRef.current;
        out.width = cur.w;
        out.height = cur.h;
        cur.ctx = out.getContext('2d');
        cur.outData = new ImageData(cur.w, cur.h);
        // compõe já, sem esperar o atraso dos ajustes: o resultado precisa estar no canvas antes
        // de qualquer clique em baixar ou enviar
        rebuildMask(paramsRef.current);
        setMeta({ device: m.device, model: m.model, ms: m.ms });
        setPhase('ready');
      } else if (m.type === 'error') {
        setPhase('idle');
        setError(
          `A remoção de fundo falhou: ${m.text}. Feche outras abas pesadas e tente de novo.`
        );
      }
    };
    worker.postMessage({ blob: W.source, width: W.w, height: W.h });
  };

  // ---------- pincel ----------

  const toImage = (e) => {
    const rect = outRef.current.getBoundingClientRect();
    const k = work.current.w / rect.width;
    return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k, k, rect };
  };

  const paintSegment = (s, from, to) => {
    const ctx = work.current.editCtx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.mode === 'keep' ? 'rgb(255,0,0)' : 'rgb(0,0,0)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = s.r * 2;
    ctx.beginPath();
    if (from) {
      ctx.moveTo(from[0], from[1]);
      ctx.lineTo(to[0], to[1]);
      ctx.stroke();
    } else {
      ctx.arc(to[0], to[1], s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    const fx = from ? from : to;
    compose(Math.min(fx[0], to[0]) - s.r - 2, Math.min(fx[1], to[1]) - s.r - 2, Math.abs(fx[0] - to[0]) + s.r * 2 + 4, Math.abs(fx[1] - to[1]) + s.r * 2 + 4);
  };

  const redrawStrokes = () => {
    const W = work.current;
    W.editCtx.clearRect(0, 0, W.w, W.h);
    for (const s of W.strokes) {
      s.pts.forEach((pt, i) => {
        const ctx = W.editCtx;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = s.mode === 'keep' ? 'rgb(255,0,0)' : 'rgb(0,0,0)';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = s.r * 2;
        ctx.beginPath();
        if (i === 0) {
          ctx.arc(pt[0], pt[1], s.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.moveTo(s.pts[i - 1][0], s.pts[i - 1][1]);
          ctx.lineTo(pt[0], pt[1]);
          ctx.stroke();
        }
        ctx.restore();
      });
    }
    compose();
  };

  const onDown = (e) => {
    if (tool === 'none' || phase !== 'ready') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const { x, y, k } = toImage(e);
    const s = { mode: tool, r: (brush / 2) * k, pts: [[x, y]] };
    strokeRef.current = s;
    paintSegment(s, null, [x, y]);
  };

  const onMove = (e) => {
    if (tool === 'none' || phase !== 'ready') return;
    const { x, y, rect } = toImage(e);
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    const s = strokeRef.current;
    if (!s) return;
    const last = s.pts[s.pts.length - 1];
    if (Math.hypot(x - last[0], y - last[1]) < 1) return;
    s.pts.push([x, y]);
    paintSegment(s, last, [x, y]);
  };

  const onUp = () => {
    if (!strokeRef.current) return;
    work.current.strokes.push(strokeRef.current);
    strokeRef.current = null;
    setStrokes(work.current.strokes.length);
  };

  const undo = () => {
    work.current.strokes.pop();
    setStrokes(work.current.strokes.length);
    redrawStrokes();
  };

  const clearStrokes = () => {
    work.current.strokes = [];
    setStrokes(0);
    redrawStrokes();
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && work.current.strokes?.length) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- saída ----------

  const bgColor = bg === 'none' ? null : bg === 'custom' ? customBg : bg;

  const makeFile = () =>
    new Promise((resolve) => {
      const W = work.current;
      const c = document.createElement('canvas');
      c.width = W.w;
      c.height = W.h;
      const ctx = c.getContext('2d');
      if (bgColor) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, W.w, W.h);
      }
      ctx.drawImage(outRef.current, 0, 0);
      const type = bgColor ? 'image/jpeg' : 'image/png';
      const base = (file?.name || 'imagem').replace(/\.[^.]+$/, '');
      c.toBlob((blob) => resolve(new File([blob], `${base}-sem-fundo.${bgColor ? 'jpg' : 'png'}`, { type })), type, 0.94);
    });

  const download = async () => {
    const f = await makeFile();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const sendTo = async (target, href) => {
    try {
      await putHandoff(target, await makeFile());
      window.location.href = href;
    } catch {
      setError('Não deu para passar a imagem para a outra ferramenta. Baixe o PNG e envie por lá.');
    }
  };

  const set = (key) => (e) =>
    setParams((p) => ({ ...p, [key]: e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value) }));

  const busy = phase === 'loading' || phase === 'running';
  const pct = progress?.total ? Math.round((progress.loaded / progress.total) * 100) : null;

  return (
    <div className="desk remover">
      <div className="rail">
        <p className="rail-title">
          <span>Imagem</span>
          <span>{dims ? `${dims.w}×${dims.h}` : '—'}</span>
        </p>
        <button
          type="button"
          className={`drop${over ? ' over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            accept(e.dataTransfer.files[0]);
          }}
        >
          <strong>{file ? 'Trocar imagem' : 'Escolher imagem'}</strong>
          <span>Clique, solte ou cole (Ctrl+V)</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            accept(e.target.files[0]);
            e.target.value = '';
          }}
        />
        {dims?.scaled && (
          <p className="field-hint">
            Reduzida de {dims.ow}×{dims.oh} para {dims.w}×{dims.h} px para caber na memória do navegador.
          </p>
        )}

        <p className="field-hint">
          Com placa de vídeo compatível roda o BiRefNet na GPU (~115 MB); sem ela, o IS-Net na CPU (~90 MB). O download acontece só na primeira vez e fica em cache no navegador.
        </p>

        <p className="rail-title">
          <span>Borda</span>
          <button type="button" className="link-btn tiny" onClick={() => setParams(DEFAULTS)}>
            Restaurar
          </button>
        </p>
        <label className="field">
          <span className="field-top">
            <em>Dureza</em>
            <b>{params.hardness}</b>
          </span>
          <input type="range" min="0" max="100" value={params.hardness} onChange={set('hardness')} />
          <span className="field-hint">Zero mantém a transição suave do modelo. Suba para logo e produto de borda reta.</span>
        </label>
        <label className="field">
          <span className="field-top">
            <em>Encolher · expandir</em>
            <b>{params.shift > 0 ? `+${params.shift}` : params.shift} px</b>
          </span>
          <input type="range" min="-8" max="8" value={params.shift} onChange={set('shift')} />
          <span className="field-hint">Negativo come a franja de fundo que sobrou em volta do assunto.</span>
        </label>
        <label className="field">
          <span className="field-top">
            <em>Suavizar</em>
            <b>{params.feather} px</b>
          </span>
          <input type="range" min="0" max="12" value={params.feather} onChange={set('feather')} />
        </label>
        <label className="check">
          <input type="checkbox" checked={params.decon} onChange={set('decon')} />
          <span>Limpar halo: tira a cor do fundo que vaza nas bordas semitransparentes</span>
        </label>

        <p className="rail-title">
          <span>Retoque à mão</span>
          <span>{strokes ? `${strokes} traço${strokes > 1 ? 's' : ''}` : ''}</span>
        </p>
        <div className="segmented">
          {[
            ['none', 'Mover'],
            ['erase', 'Apagar'],
            ['keep', 'Restaurar'],
          ].map(([k, label]) => (
            <button key={k} type="button" aria-pressed={tool === k} onClick={() => setTool(k)} disabled={phase !== 'ready'}>
              {label}
            </button>
          ))}
        </div>
        <label className="field brush-size">
          <span className="field-top">
            <em>Pincel</em>
            <b>{brush} px</b>
          </span>
          <input type="range" min="4" max="160" value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
        </label>
        <div className="presets">
          <button type="button" className="preset" onClick={undo} disabled={!strokes}>
            Desfazer
          </button>
          <button type="button" className="preset" onClick={clearStrokes} disabled={!strokes}>
            Limpar retoques
          </button>
        </div>

        <p className="rail-title">
          <span>Fundo novo</span>
        </p>
        <div className="bg-row">
          {BGS.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`bg-chip${b.key === 'none' ? ' checker' : ''}`}
              style={b.key !== 'none' ? { background: b.key } : undefined}
              aria-pressed={bg === b.key}
              onClick={() => setBg(b.key)}
              title={b.label}
              aria-label={b.label}
            />
          ))}
          <label className={`bg-chip custom${bg === 'custom' ? ' on' : ''}`} style={{ background: customBg }} title="Outra cor">
            <input
              type="color"
              value={customBg}
              onChange={(e) => {
                setCustomBg(e.target.value);
                setBg('custom');
              }}
              aria-label="Outra cor de fundo"
            />
          </label>
        </div>
      </div>

      <div className="pane">
        <header className="pane-head">
          <span>{peek ? 'Original' : 'Sem fundo'}</span>
          {phase === 'ready' ? (
            <span className="pane-tools">
              <button
                type="button"
                onPointerDown={() => setPeek(true)}
                onPointerUp={() => setPeek(false)}
                onPointerLeave={() => setPeek(false)}
              >
                Segure para ver o original
              </button>
            </span>
          ) : (
            <b>{busy ? status : '—'}</b>
          )}
        </header>
        <div
          className={`stage remover-stage${phase === 'ready' ? ' filled' : ''}`}
          style={phase === 'ready' && bgColor ? { background: bgColor } : undefined}
        >
          <div
            className={`cut-frame${tool !== 'none' && phase === 'ready' ? ` painting ${tool}` : ''}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => setCursor(null)}
            hidden={!preview}
          >
            <canvas ref={outRef} className={phase === 'ready' && !peek ? '' : 'is-hidden'} />
            {preview && (phase !== 'ready' || peek) && (
              <img src={preview} alt="Imagem original" draggable="false" className={busy ? 'scanning' : ''} />
            )}
            {busy && <i className="scan" aria-hidden="true" />}
            {cursor && tool !== 'none' && phase === 'ready' && (
              <span
                className={`brush-ring ${tool}`}
                style={{ left: cursor.x, top: cursor.y, width: brush, height: brush }}
                aria-hidden="true"
              />
            )}
          </div>
          {!preview && <p className="empty">Escolha uma foto: o fundo sai sozinho</p>}
        </div>
        <dl className="readout">
          <div>
            <dt>Dimensão</dt>
            <dd>{dims ? `${dims.w}×${dims.h}` : '—'}</dd>
          </div>
          <div>
            <dt>Motor</dt>
            <dd>{meta ? `${meta.model} · ${meta.device === 'webgpu' ? 'GPU' : 'CPU'}` : '—'}</dd>
          </div>
          <div>
            <dt>Tempo</dt>
            <dd>{meta ? `${(meta.ms / 1000).toFixed(1)} s` : '—'}</dd>
          </div>
          <div>
            <dt>Saída</dt>
            <dd>{phase === 'ready' ? (bgColor ? 'JPG' : 'PNG') : '—'}</dd>
          </div>
        </dl>
      </div>

      {busy && (
        <div className="bar determinate" role="status" aria-live="polite">
          {phase === 'loading' && pct !== null ? <i style={{ width: `${pct}%` }} /> : <i className="sweep" />}
        </div>
      )}
      {phase === 'loading' && progress?.total > 0 && (
        <p className="notice">
          Baixando o modelo: {mb(progress.loaded)} de {mb(progress.total)} ({pct}%). Só na primeira vez — depois
          ele abre do cache do navegador.
        </p>
      )}

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <div className="desk-foot">
        <p className="note">
          {phase === 'ready'
            ? 'Tudo processado no seu navegador. Nenhuma imagem foi enviada.'
            : 'O modelo roda no seu navegador: a imagem não sai da sua máquina.'}
        </p>
        <div className="actions">
          {phase === 'ready' && (
            <>
              <button type="button" className="btn ghost" onClick={() => sendTo('composer', '/recorte')}>
                Levar ao recorte livre
              </button>
              <button type="button" className="btn ghost" onClick={() => sendTo('desk', '/#mesa')}>
                Vetorizar
              </button>
            </>
          )}
          <button type="button" className="btn" onClick={download} disabled={phase !== 'ready'}>
            Baixar {bgColor ? 'JPG' : 'PNG'}
          </button>
        </div>
      </div>
    </div>
  );
}
