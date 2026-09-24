import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/bgio': { target: 'http://localhost:8000', changeOrigin: true, ws: true } } },
  build: { rollupOptions: { output: { manualChunks: { three: ['three'], boardgame: ['boardgame.io'] } } } }
});

