#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { runFromEnv } from './index';

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

applyDotEnv();
runFromEnv();
