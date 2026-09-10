'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const BASE = {
  mode: 'color',
  level: 128,
  denoise: false,
  corners: false,
  plate: true,
};

// Cada receita é um ponto de partida testado, não um botão de sorte.
const PRESETS = {
  marca: {
    label: 'Marca',
    note: 'Logo e ícone: paleta curta, cantos vivos, contorno limpo.',
    colors: 8,
    detail: 900,
    tol: 1,
    smooth: 0.3,
    pathomit: 4,
    seal: 0.6,
    corners: true,
  },
  ilustra: {
    label: 'Ilustração',
    note: 'Desenho e arte chapada. Paleta larga de propósito: com poucas cores o degradê se estilhaça.',
    colors: 24,
    detail: 1000,
    tol: 1.2,
    smooth: 0.6,
    pathomit: 10,
    seal: 0.6,
  },
  fiel: {
    label: 'Fiel',
    note: 'Máxima fidelidade de cor. Passa fácil de mil caminhos — compacte antes de usar.',
    colors: 64,
    detail: 1200,
    tol: 0.6,
    smooth: 0.3,
    pathomit: 2,
    seal: 0.5,
  },
  pixel: {
    label: 'Pixel art',
    note: 'Mantém a escada dos pixels: sem desfoque, sem descarte, sem selagem.',
    colors: 16,
    detail: 320,
    tol: 0.1,
    smooth: 0,
    pathomit: 0,
    seal: 0,
    corners: true,
  },
  retrato: {
    label: 'Retrato',
    note: 'Rosto reconhecível, não fotorrealista. Recorte as pessoas antes de traçar.',
    colors: 40,
    detail: 700,
    tol: 1.4,
    smooth: 1.2,
    pathomit: 10,
    seal: 0.8,
    denoise: true,
  },
  popart: {
    label: 'Pop art',
    note: 'Assume a posterização: poucas camadas, blocos chapados.',
    colors: 12,
    detail: 600,
    tol: 2,
    smooth: 1.6,
    pathomit: 16,
    seal: 1,
    denoise: true,
  },
  mono: {
    label: 'Preto e branco',
    note: 'Corte em dois tons antes de traçar. Ideal para carimbo, vinil e estêncil.',
    mode: 'mono',
    level: 128,
    colors: 2,
    detail: 1000,
    tol: 0.8,
    smooth: 0.4,
    pathomit: 6,
    seal: 0.5,
    corners: true,
  },
  cinza: {
    label: 'Tons de cinza',
    note: 'Sem cor, com sombra: oito tons no lugar da paleta.',
    mode: 'gray',
    colors: 8,
    detail: 900,
    tol: 1.2,
    smooth: 1,
    pathomit: 20,
    seal: 0.6,
  },
  logo: {
    label: 'Logo',
    note: 'Paleta cheia e leitura em alta resolução para reflexo e brilho metálico. Pesado sem compactar — use o botão Compactar SVG depois.',
    colors: 128,
    detail: 1600,
    tol: 0.6,
    smooth: 2,
    pathomit: 0,
    seal: 2,
    plate: true,
  },
};

for (const key of Object.keys(PRESETS)) {
  PRESETS[key] = { ...BASE, ...PRESETS[key] };
}

const MODES = [
  { id: 'color', label: 'Cor' },
  { id: 'gray', label: 'Cinza' },
  { id: 'mono', label: 'P&B' },
];

const ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/gif';

function bytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function num(n) {
  return typeof n === 'number' ? n.toLocaleString('pt-BR') : '—';
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

export default function Desk() {
  const inputRef = useRef(null);
  const frameRef = useRef(null);
  const dragRef = useRef(null);

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [crop, setCrop] = useState(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [optimized, setOptimized] = useState(null);
  const [packing, setPacking] = useState(false);
  const [preset, setPreset] = useState('marca');
  const [params, setParams] = useState(PRESETS.marca);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const accept = useCallback((next) => {
    if (!next) return;
    if (!next.type.startsWith('image/')) {
      setError('Esse arquivo não é uma imagem. Use PNG, JPG, WebP ou AVIF.');
      return;
    }
    setError(null);
    setResult(null);
    setOptimized(null);
    setCrop(null);
    setFile(next);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(next);
    });
  }, []);

  useEffect(() => {
    const onPaste = (event) => {
      const item = [...(event.clipboardData?.files || [])][0];
      if (item) accept(item);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [accept]);

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value);
    setParams((old) => ({ ...old, [key]: value }));
    setPreset('livre');
  };

  const applyPreset = (key) => {
    setPreset(key);
    setParams(PRESETS[key]);
  };

  // ----- recorte: arrastar sobre a imagem original -----

  const pointToImage = (event) => {
    const box = frameRef.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      x: clamp01((event.clientX - box.left) / box.width),
      y: clamp01((event.clientY - box.top) / box.height),
    };
  };

  const startCrop = (event) => {
    if (!preview || event.button > 0) return;
    const start = pointToImage(event);
    if (!start) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = start;
    setCrop({ x: start.x, y: start.y, w: 0, h: 0 });
  };

  const moveCrop = (event) => {
    const start = dragRef.current;
    if (!start) return;
    const now = pointToImage(event);
    if (!now) return;
    setCrop({
      x: Math.min(start.x, now.x),
      y: Math.min(start.y, now.y),
      w: Math.abs(now.x - start.x),
      h: Math.abs(now.y - start.y),
    });
  };

  const endCrop = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setCrop((old) => (old && old.w > 0.03 && old.h > 0.03 ? old : null));
  };

  const centerCrop = () => setCrop({ x: 0.15, y: 0.1, w: 0.7, h: 0.8 });

  async function convert() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setOptimized(null);

    const body = new FormData();
    body.append('image', file);
    body.append('colors', params.colors);
    body.append('detail', params.detail);
    body.append('ltres', params.tol);
    body.append('qtres', params.tol);
    body.append('smooth', params.smooth);
    body.append('denoise', params.denoise ? 1 : 0);
    body.append('pathomit', params.pathomit);
    body.append('corners', params.corners ? 'true' : 'false');
    body.append('seal', params.seal);
    body.append('plate', params.plate ? 'true' : 'false');
    body.append('mode', params.mode);
    body.append('level', params.level);
    if (crop) body.append('crop', [crop.x, crop.y, crop.w, crop.h].map((n) => n.toFixed(4)).join(','));

    try {
      const response = await fetch('/api/convert', { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'A vetorização falhou.');
      setResult(data);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function pack() {
    if (!result || packing) return;
    setPacking(true);
    setError(null);
    try {
      const response = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ svg: result.svg, precision: 1, merge: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'A compactação falhou.');
      setOptimized(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setPacking(false);
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([optimized?.svg || result.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${result.stats.name || 'vetor'}${optimized ? '.min' : ''}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const stats = result?.stats;
  const shown = optimized
    ? { svg: optimized.svg, measure: optimized.after }
    : { svg: result?.svg, measure: stats };
  const saved = optimized ? Math.round((1 - optimized.after.bytes / optimized.before.bytes) * 100) : null;
  const shrink = shown.measure ? Math.round((1 - shown.measure.bytes / stats.sourceBytes) * 100) : null;
  const heavy = stats && (stats.bytes > 1.5 * 1024 * 1024 || stats.paths > 2500);
  const recipe = preset === 'livre' ? null : PRESETS[preset];
  const mono = params.mode === 'mono';

  // Aviso antes de gastar 7 segundos: essa combinação explode em caminhos.
  const risk =
    (mono ? 0 : params.colors > 64 ? 2 : params.colors > 40 ? 1 : 0) +
    (params.detail > 1200 ? 2 : params.detail > 1000 ? 1 : 0) +
    (params.tol < 0.4 ? 2 : params.tol < 0.7 ? 1 : 0) +
    (params.pathomit < 2 ? 1 : 0);
  const tooMuch = risk >= 5 && preset === 'livre';

  return (
    <div className={`desk${busy ? ' working' : ''}`}>
      <div className="rail">
        <p className="rail-title">
          <span>01 · Imagem</span>
          <span>{file ? bytes(file.size) : 'vazio'}</span>
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
            accept(e.dataTransfer.files?.[0]);
          }}
        >
          <strong>{file ? 'Trocar imagem' : 'Solte uma imagem aqui'}</strong>
          <span>{file ? file.name : 'ou clique · ou cole com Ctrl+V'}</span>
        </button>
        <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => accept(e.target.files?.[0])} />

        <p className="rail-title">
          <span>02 · Receita</span>
          <span>{recipe ? recipe.label.toLowerCase() : 'livre'}</span>
        </p>
        <div className="presets">
          {Object.entries(PRESETS).map(([key, value]) => (
            <button
              key={key}
              type="button"
              className="preset"
              aria-pressed={preset === key}
              onClick={() => applyPreset(key)}
            >
              {value.label}
            </button>
          ))}
        </div>
        {recipe && <p className="recipe-note">{recipe.note}</p>}

        <p className="rail-title">
          <span>03 · Ajustes</span>
        </p>

        <div className="field">
          <span className="field-top">
            <em>Modo de cor</em>
            <b>{mono ? 'dois tons' : params.mode === 'gray' ? 'cinza' : 'paleta'}</b>
          </span>
          <div className="segmented">
            {MODES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={params.mode === option.id}
                onClick={() => {
                  setParams((old) => ({ ...old, mode: option.id }));
                  setPreset('livre');
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {mono ? (
          <label className="field">
            <span className="field-top">
              <em>Corte do preto</em>
              <b>{params.level}</b>
            </span>
            <input type="range" min="20" max="235" step="1" value={params.level} onChange={set('level')} />
            <span className="field-hint">
              Tudo mais escuro que este nível vira preto; o resto vira branco. Suba para engrossar o traço.
            </span>
          </label>
        ) : (
          <label className="field">
            <span className="field-top">
              <em>{params.mode === 'gray' ? 'Tons de cinza' : 'Cores da paleta'}</em>
              <b>{params.colors}</b>
            </span>
            <input
              type="range"
              min="2"
              max={params.mode === 'gray' ? 32 : 128}
              step="1"
              value={params.colors}
              onChange={set('colors')}
            />
            <span className="field-hint">
              {params.mode === 'gray'
                ? 'Os tons são espaçados por igual: cada nível a mais vira mais uma faixa para contornar.'
                : 'De 32 a 48 um rosto continua reconhecível. Em degradê, cor de menos estilhaça mais que cor demais.'}
            </span>
          </label>
        )}

        <label className="field">
          <span className="field-top">
            <em>Detalhe da leitura</em>
            <b>{params.detail} px</b>
          </span>
          <input type="range" min="200" max="1600" step="20" value={params.detail} onChange={set('detail')} />
          <span className="field-hint">Lado maior usado na varredura. Mais alto lê detalhes finos e demora mais.</span>
        </label>

        <label className="field">
          <span className="field-top">
            <em>Tolerância da curva</em>
            <b>{params.tol.toFixed(2)}</b>
          </span>
          <input type="range" min="0.1" max="4" step="0.1" value={params.tol} onChange={set('tol')} />
          <span className="field-hint">Baixo copia o contorno nó a nó. Alto usa menos nós e suaviza a forma.</span>
        </label>

        <label className="field">
          <span className="field-top">
            <em>Descartar manchas</em>
            <b>{params.pathomit} px</b>
          </span>
          <input type="range" min="0" max="40" step="1" value={params.pathomit} onChange={set('pathomit')} />
          <span className="field-hint">Em foto, 8 a 10 joga fora o ruído de pele e deixa só as formas do rosto.</span>
        </label>

        <label className="field">
          <span className="field-top">
            <em>Suavizar bordas</em>
            <b>{params.smooth.toFixed(1)}</b>
          </span>
          <input type="range" min="0" max="2" step="0.1" value={params.smooth} onChange={set('smooth')} />
          <span className="field-hint">Foto de pele pede 1,2. Zere para pixel art.</span>
        </label>

        <label className="field">
          <span className="field-top">
            <em>Selar emendas</em>
            <b>{params.seal.toFixed(1)} px</b>
          </span>
          <input type="range" min="0" max="2" step="0.1" value={params.seal} onChange={set('seal')} />
          <span className="field-hint">
            Contorno da própria cor cobrindo a junta entre formas vizinhas. É o que tira os pontinhos claros de
            cores lisas. Zero deixa o arquivo menor.
          </span>
        </label>

        <label className="check">
          <input type="checkbox" checked={params.plate} onChange={set('plate')} />
          <span>Chapa de fundo na cor dominante (só em imagem opaca)</span>
        </label>

        <label className="check">
          <input type="checkbox" checked={params.denoise} onChange={set('denoise')} />
          <span>Limpar artefatos de JPG antes de ler os pixels</span>
        </label>

        <label className="check">
          <input type="checkbox" checked={params.corners} onChange={set('corners')} />
          <span>Preservar cantos retos em vez de arredondar</span>
        </label>

        {tooMuch && (
          <p className="rail-warn">
            Muita cor, muito detalhe e tolerância baixa ao mesmo tempo: essa combinação costuma passar de
            40 mil caminhos e vários MB. Comece por uma receita e ajuste a partir dela.
          </p>
        )}
      </div>

      <div className="viewer">
        <section className="pane">
          <header className="pane-head">
            <span>Original · raster</span>
            {preview ? (
              <span className="pane-tools">
                <button type="button" onClick={centerCrop}>
                  Recorte central
                </button>
                <button type="button" onClick={() => setCrop(null)} disabled={!crop}>
                  Limpar
                </button>
              </span>
            ) : (
              <b>—</b>
            )}
          </header>
          <div className={`stage${preview ? ' filled' : ''}`}>
            {preview ? (
              <div
                className="crop-frame"
                ref={frameRef}
                onPointerDown={startCrop}
                onPointerMove={moveCrop}
                onPointerUp={endCrop}
                onPointerCancel={endCrop}
              >
                <img src={preview} alt="Imagem original enviada" draggable="false" />
                {crop && (
                  <div
                    className="crop-box"
                    style={{
                      left: `${crop.x * 100}%`,
                      top: `${crop.y * 100}%`,
                      width: `${crop.w * 100}%`,
                      height: `${crop.h * 100}%`,
                    }}
                  />
                )}
              </div>
            ) : (
              <p className="empty">Nenhuma imagem na mesa</p>
            )}
          </div>
          <dl className="readout">
            <div>
              <dt>Dimensão</dt>
              <dd>{stats ? `${stats.sourceWidth}×${stats.sourceHeight}` : '—'}</dd>
            </div>
            <div>
              <dt>Peso</dt>
              <dd>{file ? bytes(file.size) : '—'}</dd>
            </div>
            <div>
              <dt>Recorte</dt>
              <dd>{crop ? `${Math.round(crop.w * 100)}×${Math.round(crop.h * 100)}%` : 'cheio'}</dd>
            </div>
          </dl>
        </section>

        <section className="pane">
          <header className="pane-head">
            <span>Vetorizado · svg{optimized ? ' compactado' : ''}</span>
            <b>{busy ? 'traçando' : packing ? 'compactando' : stats ? `${stats.ms} ms` : '—'}</b>
          </header>
          <div className={`stage${result ? ' filled' : ''}`}>
            {result ? (
              <div className="stage-svg" dangerouslySetInnerHTML={{ __html: shown.svg }} />
            ) : (
              <p className="empty">{busy ? 'Separando camadas e ajustando curvas' : 'O traçado aparece aqui'}</p>
            )}
          </div>
          <dl className="readout">
            <div>
              <dt>Caminhos</dt>
              <dd>{num(shown.measure?.paths)}</dd>
            </div>
            <div>
              <dt>Nós</dt>
              <dd>{num(shown.measure?.nodes)}</dd>
            </div>
            <div>
              <dt>Peso</dt>
              <dd>{shown.measure ? bytes(shown.measure.bytes) : '—'}</dd>
            </div>
            <div>
              <dt>Gzip</dt>
              <dd>{shown.measure ? bytes(shown.measure.gzipBytes) : '—'}</dd>
            </div>
          </dl>
        </section>
      </div>

      {busy && (
        <div className="bar" role="status" aria-live="polite">
          <i />
        </div>
      )}

      {preview && !crop && (
        <p className="notice">
          Arraste sobre a imagem original para traçar só as pessoas. O fundo de uma foto costuma responder pela
          maior parte dos caminhos descartáveis.
        </p>
      )}

      {heavy && !optimized && (
        <p className="notice" role="status">
          {num(stats.paths)} caminhos e {bytes(stats.bytes)} de SVG. Nesse tamanho o navegador engasga para
          renderizar: compacte o arquivo, reduza as cores, aumente o descarte de manchas ou recorte mais perto
          das pessoas.
        </p>
      )}

      {optimized && (
        <p className="notice win" role="status">
          Compactado em {optimized.ms} ms: {bytes(optimized.before.bytes)} → <b>{bytes(optimized.after.bytes)}</b>{' '}
          ({saved}% menor) · {num(optimized.before.paths)} → {num(optimized.after.paths)} caminhos · na web, com
          gzip, saem {bytes(optimized.after.gzipBytes)}. O download já leva esta versão.
        </p>
      )}

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <div className="desk-foot">
        <p className="note">
          {stats
            ? `${num(shown.measure.paths)} caminhos · ${num(shown.measure.nodes)} nós · ${
                shrink >= 0 ? `${shrink}% menor que o original` : `${Math.abs(shrink)}% maior que o original`
              }`
            : 'Envie uma imagem, escolha a receita e vetorize.'}
        </p>
        <div className="actions">
          {result && !optimized && (
            <button type="button" className="btn ghost" onClick={pack} disabled={packing}>
              {packing ? 'Compactando…' : 'Compactar SVG'}
            </button>
          )}
          {result && (
            <button type="button" className="btn ghost" onClick={download}>
              Baixar SVG
            </button>
          )}
          <button type="button" className="btn" onClick={convert} disabled={!file || busy}>
            {busy ? 'Traçando…' : 'Vetorizar imagem'}
          </button>
        </div>
      </div>
    </div>
  );
}
