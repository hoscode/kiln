import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'apps/ui',
  plugins: [svelte()],
  server: { fs: { allow: [repoRoot] } },
  build: { outDir: '../../dist', emptyOutDir: true },
});
