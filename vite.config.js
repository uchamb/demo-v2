import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'mpa',
  base: '/demo-v2/',
  server: { host: '0.0.0.0', port: 5179, strictPort: true },
  preview: { host: '0.0.0.0', port: 5183, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('three/build/three.core')) return 'three-core';
          if (id.includes('three/build/three.module')) return 'three-renderer';
        },
      },
    },
  },
});
