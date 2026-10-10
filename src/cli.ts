#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runFromEnv } from './index';
import { startViewer } from './serve';

const applyDotEnv = () => {
  const envFilePath = path.resolve(process.cwd(), '.env');
  if (!existsSync(envFilePath)) {
    return;
  }

  const content = readFileSync(envFilePath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) {
      return;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();

    if (!key || process.env[key] !== undefined) {
      return;
    }

    const value = rawValue.replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  });
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  let isServe = false;
  let port = Number(process.env.PORT) || 8207;

  for (const arg of args) {
    // --run-graph is kept as an alias of --serve
    if (arg === '--serve' || arg === '--run-graph') {
      isServe = true;

      continue;
    }

    if (arg.startsWith('--port=')) {
      const parsed = parseInt(arg.slice('--port='.length), 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        port = parsed;
      }
    }
  }

  return { isServe, port };
};

applyDotEnv();

const { isServe, port } = parseArgs();
const { outputDir } = runFromEnv();

if (isServe) {
  const repetitionLimit = Number(process.env.REPETITIVE_COUNT_FOR_REMOVE_FROM_TREE);
  startViewer({
    port,
    dumpDir: outputDir,
    viewerConfig: repetitionLimit > 0 ? { repetitionLimit } : {},
  });
}
