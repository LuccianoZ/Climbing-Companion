import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // No blanket threshold: DoD §17.2's ≥80% is checked per touched
      // service, not as a whole-repo gate that would fail on
      // not-yet-tested scaffold (e.g. health.controller.ts).
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/data-source*.ts', 'src/migrations/**'],
    },
  },
  plugins: [swc.vite()],
});
