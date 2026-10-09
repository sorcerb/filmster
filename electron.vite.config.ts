import { resolve } from 'path';
import { defineConfig } from 'electron-vite';

// https://electron-vite.org/config
export default defineConfig({
  main: {
    build: {
      // Bundle dependencies into main.js so node_modules isn't needed in the package
      externalizeDeps: false,
      rollupOptions: {
        input: resolve(__dirname, 'src/main/main.ts'),
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/preload.ts'),
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
});
