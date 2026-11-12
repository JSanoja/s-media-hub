import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// La interfaz la sirve la API en /tv/. En desarrollo, Vite hace de proxy a la API
// (API_URL, por defecto http://localhost:30001) para no tener problemas de CORS.
const api = process.env.API_URL ?? 'http://localhost:30001';

export default defineConfig({
  base: '/tv/',
  plugins: [preact()],
  build: {
    // WebView del Chromecast with Google TV (Chromium reciente) → ES2020 alcanza.
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': api,
      '/media': api,
    },
  },
});
