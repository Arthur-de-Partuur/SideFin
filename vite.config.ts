/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const version: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

/** Writes version.json next to the app, so an open page can see that a newer version is online. */
function versionFile(): Plugin {
  return {
    name: 'sidefin-version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) + '\n' });
    },
  };
}

// GitHub Pages serves the app from /SideFin/ (main) and /SideFin/dev/ (dev).
export default defineConfig({
  base: process.env.SIDEFIN_BASE ?? '/SideFin/',
  plugins: [react(), versionFile()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
