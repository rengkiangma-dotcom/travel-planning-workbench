import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

/* 源文件叫 next.html（避免覆盖旧版 index.html），产物统一改名成 index.html。 */
function nextIndexHtml() {
  return {
    name: 'next-index-html',
    apply: 'build',
    closeBundle() {
      const out = resolve(process.cwd(), 'next');
      if (existsSync(resolve(out, 'next.html'))) renameSync(resolve(out, 'next.html'), resolve(out, 'index.html'));
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [vue(), nextIndexHtml()],
  base: command === 'build' ? '/next/' : '/',
  build: {
    outDir: 'next',
    emptyOutDir: true,
    rollupOptions: { input: { index: 'next.html' } },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:18647' },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.js'],
  },
}));
