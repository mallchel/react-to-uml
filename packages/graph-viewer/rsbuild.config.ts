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
  // Graph JSON assets are produced by the CLI gather step in the user's CWD
  // and are served by src/serve.ts at runtime.
  server: {
    publicDir: [
      { name: path.resolve(process.cwd(), 'public') },
    ],
  },
  dev: {
    assetPrefix: '/',
  },
});
