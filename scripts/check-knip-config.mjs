#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const knip = JSON.parse(readFileSync(resolve(import.meta.dirname, '../knip.json'), 'utf8'));
const violations = [];
for (const [workspace, cfg] of Object.entries(knip.workspaces ?? {})) {
  for (const entry of cfg.entry ?? []) {
    if (/^src\/\*\*/.test(entry)) {
      violations.push(`${workspace}: forbidden wildcard entry "${entry}" (disables dead-file detection)`);
    }
  }
}
if (violations.length > 0) {
  console.error('knip.json validation failed:\n' + violations.map((v) => `  - ${v}`).join('\n'));
  process.exit(1);
}
console.log('knip.json validation passed.');
