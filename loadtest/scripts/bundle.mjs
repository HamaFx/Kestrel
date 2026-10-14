#!/usr/bin/env node
import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const testsDir = join(root, 'tests');
const outDir = join(root, 'dist', 'tests');

rmSync(join(root, 'dist'), { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const entryPoints = readdirSync(testsDir)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => join(testsDir, f));

await build({
  entryPoints,
  outdir: outDir,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  sourcemap: false,
  external: ['k6', 'k6/*'],
  mainFields: ['module', 'main'],
  logLevel: 'info',
});

cpSync(join(root, 'lib', 'data'), join(root, 'dist', 'lib', 'data'), { recursive: true });
console.log(`[loadtest:bundle] Bundled ${entryPoints.length} k6 test entrypoints into dist/tests/`);
