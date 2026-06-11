import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import yaml from '@rollup/plugin-yaml';

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), yaml()],
  // Relative base so the standalone bundle works from any subdirectory
  // (e.g. the al-folio site serves it under /assets/delta_sim/).
  base: command === 'build' && mode === 'standalone' ? './' : '/',
  build: {
    outDir: mode === 'standalone' ? 'dist-standalone' : 'dist',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    // Allow the dev server to serve ../config/presets.yaml (outside the Vite root).
    fs: {
      allow: ['..'],
    },
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/ws': {
        target: 'ws://127.0.0.1:8080',
        ws: true,
      },
    },
  },
}));
