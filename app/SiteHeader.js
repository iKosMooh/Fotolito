'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export const TOOLS = [
  {
    href: '/#mesa',
    path: '/',
    short: 'Vetorizar',
    plate: 'mag',
    title: 'Vetorizar em SVG',
    text: 'PNG, JPG, WebP ou AVIF viram caminhos de Bézier.',
  },
  {
    href: '/fundo',
    path: '/fundo',
    short: 'Fundo',
    plate: 'blu',
    title: 'Remover fundo',
    text: 'Isola o assunto sozinho, com retoque à mão e borda limpa.',
  },
  {
    href: '/recorte',
    path: '/recorte',
    short: 'Recorte',
    plate: 'yel',
    title: 'Recorte livre',
    text: 'Monte várias imagens numa área com tamanho exato em px.',
  },
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <header className="masthead">
      <div className="shell masthead-in">
        <a className="wordmark" href="/">
          <span className="regmarks" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Fotolito
        </a>
        <nav aria-label="Ferramentas">
          <ul className="plates">
            {TOOLS.map((tool) => {
              const current = pathname === tool.path;
              return (
                <li key={tool.path}>
                  <a
                    href={tool.href}
                    className={`plate plate-${tool.plate}`}
                    aria-current={current ? 'page' : undefined}
                    title={tool.text}
                  >
                    <i aria-hidden="true" />
                    {tool.short}
                  </a>
                </li>
              );
            })}
          </ul>
          <div className="tools-menu" ref={boxRef}>
            <button
              type="button"
              className="tools-toggle"
              aria-expanded={open}
              aria-haspopup="true"
              onClick={() => setOpen((v) => !v)}
            >
              Ferramentas
              <svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true">
                <path d="M1 1 L5 5 L9 1" fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
            {open && (
              <div className="tools-list">
                {TOOLS.map((tool) => (
                  <a
                    key={tool.path}
                    href={tool.href}
                    className={`plate-${tool.plate}`}
                    aria-current={pathname === tool.path ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <b>{tool.title}</b>
                    <span>{tool.text}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
          <a href="/#processo" className="nav-how">
            Como funciona
          </a>
        </nav>

        <a
          className="byline"
          href="https://caiodev.net.br/pt-BR"
          target="_blank"
          rel="noopener noreferrer"
          title="Site de Caio Souza Solutions"
        >
          <img src="/caio-souza-solutions.png" alt="" width="640" height="165" />
          <span>
            <b>Caio Souza</b>
            <em>caiodev.net.br</em>
          </span>
        </a>
      </div>
    </header>
  );
}
