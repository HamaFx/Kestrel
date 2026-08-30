#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const output = resolve(root, process.env.SBOM_OUTPUT_DIR ?? 'artifacts/sbom');
const syft =
  process.env.SYFT_BIN ??
  (existsSync(resolve(root, '.tools/bin/syft')) ? resolve(root, '.tools/bin/syft') : 'syft');
const timeoutMs = Number.parseInt(process.env.SBOM_TIMEOUT_MS ?? '120000', 10);
mkdirSync(output, { recursive: true });

try {
  execFileSync(syft, ['dir:.', '-o', `spdx-json=${resolve(output, 'source.spdx.json')}`], {
    cwd: root,
    stdio: 'inherit',
    timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120000,
  });
} catch {
  console.error(
    'SBOM generation requires Syft. Install it from https://github.com/anchore/syft, then rerun this command.',
  );
  process.exit(1);
}

console.log(`Source SBOM written to ${output}`);
