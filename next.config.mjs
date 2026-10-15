/** @type {import('next').NextConfig} */
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/** Fixa a raiz do projeto: existe um package-lock.json solto acima desta pasta. */
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  outputFileTracingRoot: projectRoot,
  // build de verificação em pasta separada não derruba o `next dev` rodando em .next
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['sharp', 'imagetracerjs'],
  // isolamento de origem libera SharedArrayBuffer: o ONNX Runtime usa todos os núcleos na
  // remoção de fundo em vez de um só (sem isso o IS-Net leva ~1 min numa CPU comum)
  async headers() {
    return [
      {
        source: '/fundo',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
      {
        // o worker carregado por uma página isolada também precisa declarar COEP, senão não sobe
        source: '/_next/static/:path*',
        headers: [{ key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' }],
      },
    ];
  },
};

export default nextConfig;
