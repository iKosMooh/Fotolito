'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { takeHandoff } from '../lib/handoff';

const SIZES = [
  { label: '1080 × 1080', w: 1080, h: 1080 },
  { label: '1920 × 1080', w: 1920, h: 1080 },
  { label: '1080 × 1920', w: 1080, h: 1920 },
  { label: 'A4 300 dpi', w: 2480, h: 3508 },
];

const MAX_SIDE = 8000;
const clampSize = (v) => Math.max(1, Math.min(MAX_SIDE, Math.round(Number(v) || 1)));
let seq = 0;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Não foi possível abrir ${file.name}`));
    };
    img.src = url;
  });
}

export default function Composer() {
  const [size, setSize] = useState({ w: 1080, h: 1080 });
  const [draft, setDraft] = useState({ w: '1080', h: '1080' });
  const [bg, setBg] = useState({ on: false, color: '#ffffff' });
  const [layers, setLayers] = useState([]);
  const [selId, setSelId] = useState(null);
  const [lockRatio, setLockRatio] = useState(true);
  const [format, setFormat] = useState('image/png');
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const [scale, setScale] = useState(1);
  const [shift, setShift] = useState(false);
  const [dragRow, setDragRow] = useState(null);
  const [dropRow, setDropRow] = useState(null);

  // alças ficam magenta com Shift pressionado: sinal de que o arraste vai cortar
  useEffect(() => {
    const on = (e) => setShift(e.shiftKey);
    const off = () => setShift(false);
    window.addEventListener('keydown', on);
    window.addEventListener('keyup', on);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', on);
      window.removeEventListener('keyup', on);
      window.removeEventListener('blur', off);
    };
  }, []);

  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const dragRef = useRef(null);
  const layersRef = useRef(layers);
  layersRef.current = layers;

  const sel = layers.find((l) => l.id === selId) || null;

  // escala de exibição: o artboard trabalha em px reais e só é reduzido na tela
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const fit = () => {
      const availW = el.clientWidth - 112;
      const availH = Math.max(260, window.innerHeight * 0.62 - 72);
      setScale(Math.min(1, availW / size.w, availH / size.h));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener('resize', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [size]);

  useEffect(
    () => () => {
      layersRef.current.forEach((l) => URL.revokeObjectURL(l.url));
    },
    []
  );

  const patch = useCallback((id, fields) => {
    setLayers((all) => all.map((l) => (l.id === id ? { ...l, ...fields } : l)));
  }, []);

  const addFiles = async (files) => {
    setError('');
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    const added = [];
    for (const file of list) {
      try {
        const { img, url } = await loadImage(file);
        const nw = img.naturalWidth;
        const nh = img.naturalHeight;
        // entra contida no artboard, centralizada, sem ampliar além do tamanho original
        const k = Math.min(1, size.w / nw, size.h / nh);
        const w = Math.round(nw * k);
        const h = Math.round(nh * k);
        const off = added.length * 24;
        added.push({
          id: ++seq,
          name: file.name,
          url,
          img,
          nw,
          nh,
          // região visível da imagem original (px da fonte); o corte com Shift mexe só aqui
          cx: 0,
          cy: 0,
          cw: nw,
          ch: nh,
          w,
          h,
          x: Math.round((size.w - w) / 2) + off,
          y: Math.round((size.h - h) / 2) + off,
        });
      } catch (err) {
        setError(err.message);
      }
    }
    if (added.length) {
      setLayers((all) => [...all, ...added]);
      setSelId(added[added.length - 1].id);
    }
  };

  // imagem vinda de outra ferramenta (ex.: remoção de fundo)
  useEffect(() => {
    takeHandoff('composer').then((f) => f && addFiles([f]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeLayer = (id) => {
    setLayers((all) => {
      const gone = all.find((l) => l.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return all.filter((l) => l.id !== id);
    });
    setSelId((cur) => (cur === id ? null : cur));
  };

  // arrastar na lista: a imagem solta assume a camada do item de destino
  const moveTo = (id, targetId) => {
    if (id == null || id === targetId) return;
    setLayers((all) => {
      const from = all.findIndex((l) => l.id === id);
      const to = all.findIndex((l) => l.id === targetId);
      if (from < 0 || to < 0) return all;
      const next = [...all];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const reorder = (id, dir) => {
    setLayers((all) => {
      const i = all.findIndex((l) => l.id === id);
      const j = dir === 'top' ? all.length - 1 : dir === 'bottom' ? 0 : i + dir;
      if (i < 0 || j < 0 || j >= all.length || i === j) return all;
      const next = [...all];
      const [item] = next.splice(i, 1);
      next.splice(j, 0, item);
      return next;
    });
  };

  const fitLayer = (mode) => {
    if (!sel) return;
    const k = mode === 'cover' ? Math.max(size.w / sel.cw, size.h / sel.ch) : Math.min(size.w / sel.cw, size.h / sel.ch);
    const w = Math.round(sel.cw * k);
    const h = Math.round(sel.ch * k);
    patch(sel.id, { w, h, x: Math.round((size.w - w) / 2), y: Math.round((size.h - h) / 2) });
  };

  const align = (where) => {
    if (!sel) return;
    const pos = {
      left: { x: 0 },
      hcenter: { x: Math.round((size.w - sel.w) / 2) },
      right: { x: size.w - sel.w },
      top: { y: 0 },
      vcenter: { y: Math.round((size.h - sel.h) / 2) },
      bottom: { y: size.h - sel.h },
    }[where];
    patch(sel.id, pos);
  };

  const setField = (key) => (e) => {
    if (!sel) return;
    const v = Math.round(Number(e.target.value));
    if (!Number.isFinite(v)) return;
    if (key === 'w' || key === 'h') {
      const val = Math.max(1, v);
      if (lockRatio) {
        const ratio = sel.w / sel.h;
        patch(sel.id, key === 'w' ? { w: val, h: Math.max(1, Math.round(val / ratio)) } : { h: val, w: Math.max(1, Math.round(val * ratio)) });
      } else {
        patch(sel.id, { [key]: val });
      }
    } else {
      patch(sel.id, { [key]: v });
    }
  };

  const applySize = (w, h) => {
    const next = { w: clampSize(w), h: clampSize(h) };
    setSize(next);
    setDraft({ w: String(next.w), h: String(next.h) });
  };

  // ---- arrastar e redimensionar ----
  const startDrag = (e, layer, handle) => {
    e.preventDefault();
    e.stopPropagation();
    setSelId(layer.id);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // Shift no início do gesto numa alça = cortar a imagem em vez de redimensionar
    dragRef.current = { id: layer.id, handle, crop: !!handle && e.shiftKey, sx: e.clientX, sy: e.clientY, orig: { ...layer } };
  };

  const resetCrop = () => {
    if (!sel) return;
    const kx = sel.w / sel.cw;
    const ky = sel.h / sel.ch;
    patch(sel.id, {
      cx: 0,
      cy: 0,
      cw: sel.nw,
      ch: sel.nh,
      x: Math.round(sel.x - sel.cx * kx),
      y: Math.round(sel.y - sel.cy * ky),
      w: Math.round(sel.nw * kx),
      h: Math.round(sel.nh * ky),
    });
  };

  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / scale;
    const dy = (e.clientY - d.sy) / scale;
    const o = d.orig;
    if (!d.handle) {
      patch(d.id, { x: Math.round(o.x + dx), y: Math.round(o.y + dy) });
      return;
    }
    const left = d.handle.includes('w');
    const right = d.handle.includes('e');
    const top = d.handle.includes('n');
    const bottom = d.handle.includes('s');

    if (d.crop) {
      // corte: a escala fica fixa, só a janela sobre a imagem original encolhe ou cresce
      const kx = o.w / o.cw;
      const ky = o.h / o.ch;
      const next = {};
      if (left) {
        const cx = Math.min(Math.max(0, o.cx + dx / kx), o.cx + o.cw - 4 / kx);
        next.cx = cx;
        next.cw = o.cx + o.cw - cx;
      } else if (right) {
        next.cw = Math.min(Math.max(4 / kx, o.cw + dx / kx), o.nw - o.cx);
      }
      if (top) {
        const cy = Math.min(Math.max(0, o.cy + dy / ky), o.cy + o.ch - 4 / ky);
        next.cy = cy;
        next.ch = o.cy + o.ch - cy;
      } else if (bottom) {
        next.ch = Math.min(Math.max(4 / ky, o.ch + dy / ky), o.nh - o.cy);
      }
      const cw = next.cw ?? o.cw;
      const ch = next.ch ?? o.ch;
      const w = Math.round(cw * kx);
      const h = Math.round(ch * ky);
      patch(d.id, {
        ...next,
        w,
        h,
        x: left ? o.x + o.w - w : o.x,
        y: top ? o.y + o.h - h : o.y,
      });
      return;
    }

    let w = left || right ? Math.max(4, o.w + (left ? -dx : dx)) : o.w;
    let h = top || bottom ? Math.max(4, o.h + (top ? -dy : dy)) : o.h;
    // alças laterais esticam um eixo só; os cantos respeitam a trava de proporção
    if (lockRatio && (left || right) && (top || bottom)) {
      const ratio = o.w / o.h;
      if (Math.abs(w - o.w) / o.w > Math.abs(h - o.h) / o.h) h = w / ratio;
      else w = h * ratio;
    }
    w = Math.round(w);
    h = Math.round(h);
    patch(d.id, { w, h, x: left ? o.x + o.w - w : o.x, y: top ? o.y + o.h - h : o.y });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  // setas movem 1 px (Shift: 10 px); Delete remove
  useEffect(() => {
    const onKey = (e) => {
      if (!selId) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const step = e.shiftKey ? 10 : 1;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key]) {
        e.preventDefault();
        const [mx, my] = moves[e.key];
        setLayers((all) => all.map((l) => (l.id === selId ? { ...l, x: l.x + mx, y: l.y + my } : l)));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeLayer(selId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selId]);

  const exportImage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (bg.on || format === 'image/jpeg') {
      ctx.fillStyle = bg.on ? bg.color : '#ffffff';
      ctx.fillRect(0, 0, size.w, size.h);
    }
    layers.forEach((l) => ctx.drawImage(l.img, l.cx, l.cy, l.cw, l.ch, l.x, l.y, l.w, l.h));
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[format];
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('O navegador não conseguiu gerar o arquivo. Tente um tamanho menor.');
          return;
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `recorte-${size.w}x${size.h}.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      },
      format,
      0.92
    );
  };

  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  return (
    <div className="desk composer">
      <div className="rail">
        <p className="rail-title">
          <span>Área</span>
          <span>px</span>
        </p>
        <div className="size-row">
          <label>
            <em>L</em>
            <input
              type="number"
              min="1"
              max={MAX_SIDE}
              value={draft.w}
              onChange={(e) => setDraft((d) => ({ ...d, w: e.target.value }))}
              onBlur={() => applySize(draft.w, draft.h)}
              onKeyDown={(e) => e.key === 'Enter' && applySize(draft.w, draft.h)}
            />
          </label>
          <span aria-hidden="true">×</span>
          <label>
            <em>A</em>
            <input
              type="number"
              min="1"
              max={MAX_SIDE}
              value={draft.h}
              onChange={(e) => setDraft((d) => ({ ...d, h: e.target.value }))}
              onBlur={() => applySize(draft.w, draft.h)}
              onKeyDown={(e) => e.key === 'Enter' && applySize(draft.w, draft.h)}
            />
          </label>
        </div>
        <div className="presets">
          {SIZES.map((s) => (
            <button
              key={s.label}
              type="button"
              className="preset"
              aria-pressed={size.w === s.w && size.h === s.h}
              onClick={() => applySize(s.w, s.h)}
            >
              {s.label}
            </button>
          ))}
        </div>
        {sel && (
          <button type="button" className="link-btn" onClick={() => applySize(Math.round(sel.cw), Math.round(sel.ch))}>
            Usar o tamanho original da imagem selecionada
          </button>
        )}

        <label className="check">
          <input type="checkbox" checked={bg.on} onChange={(e) => setBg((b) => ({ ...b, on: e.target.checked }))} />
          <span>Fundo de cor sólida</span>
          {bg.on && (
            <input
              type="color"
              className="swatch"
              value={bg.color}
              onChange={(e) => setBg((b) => ({ ...b, color: e.target.value }))}
              aria-label="Cor do fundo"
            />
          )}
        </label>

        <p className="rail-title">
          <span>Imagens</span>
          <span>{layers.length}</span>
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
            addFiles(e.dataTransfer.files);
          }}
        >
          <strong>Adicionar imagens</strong>
          <span>Clique ou solte uma ou várias</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {layers.length > 0 && (
          <ol className="layer-list" aria-label="Camadas: a primeira fica na frente">
            {[...layers].reverse().map((l) => (
              <li
                key={l.id}
                aria-current={l.id === selId}
                draggable
                className={`${dragRow === l.id ? 'dragging' : ''}${dropRow === l.id && dragRow !== l.id ? ' drop-target' : ''}`}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(l.id));
                  setDragRow(l.id);
                }}
                onDragOver={(e) => {
                  if (dragRow == null) return;
                  e.preventDefault();
                  setDropRow(l.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  moveTo(dragRow, l.id);
                  setDragRow(null);
                  setDropRow(null);
                }}
                onDragEnd={() => {
                  setDragRow(null);
                  setDropRow(null);
                }}
              >
                <span className="layer-grip" aria-hidden="true">⋮⋮</span>
                <button type="button" className="layer-pick" onClick={() => setSelId(l.id)}>
                  <img src={l.url} alt="" />
                  <span>{l.name}</span>
                </button>
                <button type="button" className="layer-x" onClick={() => removeLayer(l.id)} aria-label={`Remover ${l.name}`}>
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}

        {sel && (
          <>
            <p className="rail-title">
              <span>Selecionada</span>
              <span>px</span>
            </p>
            <div className="num-grid">
              {[
                ['x', 'X'],
                ['y', 'Y'],
                ['w', 'Larg.'],
                ['h', 'Alt.'],
              ].map(([key, label]) => (
                <label key={key}>
                  <em>{label}</em>
                  <input type="number" value={sel[key]} onChange={setField(key)} />
                </label>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={lockRatio} onChange={(e) => setLockRatio(e.target.checked)} />
              <span>Travar proporção nos cantos</span>
            </label>
            <div className="presets">
              <button type="button" className="preset" onClick={() => fitLayer('contain')}>
                Caber
              </button>
              <button type="button" className="preset" onClick={() => fitLayer('cover')}>
                Preencher
              </button>
              <button type="button" className="preset" onClick={() => patch(sel.id, { w: Math.round(sel.cw), h: Math.round(sel.ch) })}>
                Tamanho real
              </button>
              <button type="button" className="preset" onClick={() => patch(sel.id, { h: Math.round(sel.w * (sel.ch / sel.cw)) })}>
                Proporção original
              </button>
            </div>
            <div className="segmented six">
              {[
                ['left', '⇤'],
                ['hcenter', '↔'],
                ['right', '⇥'],
                ['top', '⤒'],
                ['vcenter', '↕'],
                ['bottom', '⤓'],
              ].map(([k, glyph]) => (
                <button key={k} type="button" onClick={() => align(k)} title={`Alinhar: ${k}`}>
                  {glyph}
                </button>
              ))}
            </div>
            <div className="segmented four">
              <button type="button" onClick={() => reorder(sel.id, 'top')}>Frente</button>
              <button type="button" onClick={() => reorder(sel.id, 1)}>Subir</button>
              <button type="button" onClick={() => reorder(sel.id, -1)}>Descer</button>
              <button type="button" onClick={() => reorder(sel.id, 'bottom')}>Fundo</button>
            </div>
            {(sel.cw < sel.nw || sel.ch < sel.nh) && (
              <button type="button" className="link-btn" onClick={resetCrop}>
                Desfazer corte ({Math.round(sel.cw)}×{Math.round(sel.ch)} de {sel.nw}×{sel.nh} px)
              </button>
            )}
            <p className="field-hint">
              Segure Shift e arraste uma alça para cortar a imagem. Setas movem 1 px, Shift + setas 10 px. Delete
              remove a imagem.
            </p>
          </>
        )}
      </div>

      <div className="pane">
        <header className="pane-head">
          <span>Área · {size.w}×{size.h} px</span>
          <b>{Math.round(scale * 100)}%</b>
        </header>
        <div
          className={`stage filled composer-stage${shift ? ' shift' : ''}`}
          ref={wrapRef}
          onPointerDown={() => setSelId(null)}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="artboard-box" style={{ width: size.w * scale, height: size.h * scale }}>
            {/* marcas de corte de gráfica: mostram onde o arquivo termina */}
            {['tl', 'tr', 'bl', 'br'].map((c) => (
              <i key={c} className={`trim ${c}`} aria-hidden="true" />
            ))}
            <span className="dim dim-w" aria-hidden="true">{size.w} px</span>
            <span className="dim dim-h" aria-hidden="true">{size.h} px</span>
            <div
              className="artboard"
              style={{
                width: size.w,
                height: size.h,
                transform: `scale(${scale})`,
                background: bg.on ? bg.color : 'transparent',
              }}
            >
              {layers.map((l) => (
                <div
                  key={l.id}
                  className="layer"
                  style={{ left: l.x, top: l.y, width: l.w, height: l.h }}
                  onPointerDown={(e) => startDrag(e, l, null)}
                >
                  <img
                    src={l.url}
                    alt={l.name}
                    draggable="false"
                    style={{
                      left: (-l.cx * l.w) / l.cw,
                      top: (-l.cy * l.h) / l.ch,
                      width: (l.nw * l.w) / l.cw,
                      height: (l.nh * l.h) / l.ch,
                    }}
                  />
                </div>
              ))}
            </div>
            {/* contorno e alças ficam fora do recorte, em escala de tela */}
            {sel && (
              <div
                className="sel-box"
                style={{ left: sel.x * scale, top: sel.y * scale, width: sel.w * scale, height: sel.h * scale }}
                onPointerDown={(e) => startDrag(e, sel, null)}
              >
                {HANDLES.map((h) => (
                  <i key={h} className={`grip ${h}`} onPointerDown={(e) => startDrag(e, sel, h)} />
                ))}
              </div>
            )}
          </div>
          {!layers.length && <p className="empty composer-empty">Adicione imagens para montar o recorte</p>}
        </div>
        <dl className="readout">
          <div>
            <dt>Área</dt>
            <dd>{size.w}×{size.h}</dd>
          </div>
          <div>
            <dt>Imagens</dt>
            <dd>{layers.length}</dd>
          </div>
          <div>
            <dt>Seleção</dt>
            <dd>{sel ? `${sel.w}×${sel.h}` : '—'}</dd>
          </div>
          <div>
            <dt>Posição</dt>
            <dd>{sel ? `${sel.x}, ${sel.y}` : '—'}</dd>
          </div>
        </dl>
      </div>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <div className="desk-foot">
        <p className="note">Só o que está dentro da área entra no arquivo. O resto é recortado.</p>
        <div className="actions">
          <select className="fmt" value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Formato">
            <option value="image/png">PNG</option>
            <option value="image/jpeg">JPG</option>
            <option value="image/webp">WebP</option>
          </select>
          <button type="button" className="btn" onClick={exportImage} disabled={!layers.length}>
            Baixar recorte
          </button>
        </div>
      </div>
    </div>
  );
}
