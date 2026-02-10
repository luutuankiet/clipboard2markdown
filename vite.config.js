import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
  base: '/clipboard2markdown/', // Important for GitHub Pages deployment
});