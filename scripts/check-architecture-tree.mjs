#!/usr/bin/env node
/**
 * Docs-drift guard (audit 2026-10-18, §11 risk register).
 *
 * The `mastra-v2/` tree in `docs/architecture.md` is the map new contributors
 * trust. This script extracts the documented top-level entries from the
 * architecture document and compares them against the real directory listing,
 * so a new module (or a deleted one) cannot silently drift from the docs.
 *
 * Usage: node scripts/check-architecture-tree.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsPath = path.join(root, 'docs', 'architecture.md');
const treeDir = path.join(root, 'packages', 'ai', 'src', 'mastra-v2');

const doc = fs.readFileSync(docsPath, 'utf8');
const fence = doc.match(/```text\nmastra-v2\/\n([\s\S]*?)```/);
if (!fence) {
  console.error('[docs-drift] docs/architecture.md has no `mastra-v2/` tree block.');
  process.exit(1);
}

const documented = fence[1]
  .split('\n')
  .map((line) => line.trim().replace(/\/$/, ''))
  .filter((line) => line.length > 0)
  .sort();

const actual = fs
  .readdirSync(treeDir, { withFileTypes: true })
  .map((entry) => entry.name)
  .sort();

const missing = actual.filter((name) => !documented.includes(name));
const stale = documented.filter((name) => !actual.includes(name));

if (missing.length > 0 || stale.length > 0) {
  console.error('[docs-drift] docs/architecture.md is out of sync with packages/ai/src/mastra-v2/.');
  if (missing.length > 0) console.error(`  undocumented entries: ${missing.join(', ')}`);
  if (stale.length > 0) console.error(`  documented but missing on disk: ${stale.join(', ')}`);
  console.error('  Update the `mastra-v2/` tree block in docs/architecture.md.');
  process.exit(1);
}

console.log(`[docs-drift] mastra-v2 tree matches docs/architecture.md (${actual.length} entries).`);
