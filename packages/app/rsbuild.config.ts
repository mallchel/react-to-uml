import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      index: path.resolve(process.cwd(), 'packages/app/client.js'),
    },
  },
  html: {
    template: path.resolve(process.cwd(), 'public/index.html'),
  },
  output: {
    distPath: {
      root: path.resolve(process.cwd(), 'build'),
    },
  },
  dev: {
    assetPrefix: '/',
  },
});
