/** @type {import('next').NextConfig} */
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/** Fixa a raiz do projeto: existe um package-lock.json solto acima desta pasta. */
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ['sharp', 'imagetracerjs'],
};

export default nextConfig;
