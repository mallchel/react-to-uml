import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      index: path.resolve(process.cwd(), 'packages/graph-viewer/client.jsx'),
    },
  },
  html: {
    template: path.resolve(process.cwd(), 'public/index.html'),
  },
  output: {
    distPath: {
      root: path.resolve(process.cwd(), 'lib/graph-viewer'),
    },
  },
  // Graph JSON files are produced by the CLI and served by src/serve.ts at runtime.
  // In dev mode they are read from DUMP_DIR (default ./assets).
  server: {
    publicDir: [
      { name: path.resolve(process.cwd(), 'public') },
      { name: path.resolve(process.cwd(), process.env.DUMP_DIR ?? 'assets'), copyOnBuild: false },
    ],
  },
  dev: {
    assetPrefix: '/',
  },
});
