import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { framesPlugin } from './apps/ui/server/frames';
import { galleryPlugin } from './apps/ui/server/gallery';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'apps/ui',
  plugins: [
    svelte(),
    galleryPlugin(fileURLToPath(new URL('gallery', import.meta.url))),
    framesPlugin(fileURLToPath(new URL('renders', import.meta.url))),
  ],
  server: { fs: { allow: [repoRoot] } },
  build: { outDir: '../../dist', emptyOutDir: true },
  worker: { format: 'es' },
});
