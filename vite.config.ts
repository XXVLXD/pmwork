import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({ plugins: [viteSingleFile()], build: { assetsInlineLimit: 2_000_000 }, server: { port: 5173, strictPort: true }, preview: { port: 4173, strictPort: true } });
