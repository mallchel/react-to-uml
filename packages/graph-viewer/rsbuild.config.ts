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
      root: path.resolve(process.cwd(), 'build/graph-viewer'),
    },
  },
  server: {
    publicDir: [
      { name: path.resolve(process.cwd(), 'public') },
      { name: path.resolve(process.cwd(), 'build/assets') },
    ],
  },
  dev: {
    assetPrefix: '/',
  },
});
