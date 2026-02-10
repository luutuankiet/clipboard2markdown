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
  test: {
    environment: 'jsdom',
    globals: true, // Enables describe, it, expect globally
  },
});