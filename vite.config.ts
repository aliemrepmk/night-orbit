import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs: the build runs from any path, e.g. GitHub Pages' /night-orbit/ (M10).
  base: './',
  build: {
    target: 'es2022',
    // three.js alone is ~700 kB unminified; one chunk is fine for a game.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
