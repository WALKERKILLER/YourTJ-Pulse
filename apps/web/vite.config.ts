import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // MapLibre ships a self-contained WebGL engine; track its minified budget explicitly.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/maplibre-gl/') || id.includes('/pmtiles/')) return 'map-engine';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router')) return 'react-vendor';
          return undefined;
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/tiles': 'http://127.0.0.1:8787',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
