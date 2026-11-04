#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const knip = JSON.parse(readFileSync(resolve(root, 'knip.json'), 'utf8'));
const violations = [];

/** Source paths declared by a package's `exports` map. */
function exportSources(pkg) {
  const sources = [];
  for (const target of Object.values(pkg.exports ?? {})) {
    // Kestrel's workspace source condition is scoped to avoid colliding with
    // third-party packages that publish their own `"source"` condition.
    const source = typeof target === 'string' ? target : target?.['@kestrel/source'];
    if (typeof source === 'string') sources.push(source.replace(/^\.\//, ''));
  }
  return sources;
}

/** Source paths referenced by package scripts (`dist/x.js` and `src/x.ts`). */
function scriptSources(pkg) {
  const sources = new Set();
  for (const command of Object.values(pkg.scripts ?? {})) {
    const text = String(command);
    for (const match of text.matchAll(/dist\/([\w./-]+)\.js\b/g)) {
      sources.add(`src/${match[1]}.ts`);
    }
    for (const match of text.matchAll(/(?:^|\s)((?:src|scripts)\/[\w./-]+\.(?:ts|mjs|js))\b/g)) {
      sources.add(match[1]);
    }
  }
  return sources;
}

/** Match an entry against an export source, expanding `*` wildcards. */
function matchesExportSource(entry, source) {
  if (!source.includes('*')) return entry === source;
  const pattern = source
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]+');
  return new RegExp(`^${pattern}$`).test(entry);
}

function loadPackageJson(workspace) {
  const path = resolve(root, workspace, 'package.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

for (const [workspace, cfg] of Object.entries(knip.workspaces ?? {})) {
  for (const entry of cfg.entry ?? []) {
    if (/^src\/\*\*/.test(entry)) {
      violations.push(
        `${workspace}: forbidden wildcard entry "${entry}" (disables dead-file detection)`,
      );
    }
    if (workspace.startsWith('packages/') && /[{}]/.test(entry)) {
      violations.push(
        `${workspace}: forbidden brace-expansion entry "${entry}" (list each entrypoint explicitly)`,
      );
    }
  }

  if (!workspace.startsWith('packages/')) continue;
  const pkg = loadPackageJson(workspace);
  if (!pkg) {
    violations.push(`${workspace}: missing package.json`);
    continue;
  }
  const exports = exportSources(pkg);
  const scripts = scriptSources(pkg);

  for (const entry of cfg.entry ?? []) {
    // Tests and package-local CLI scripts are legitimate entrypoints that are
    // not published through `exports`.
    if (!entry.startsWith('src/') || entry.startsWith('src/schema/relations.ts')) continue;
    if (exports.some((source) => matchesExportSource(entry, source))) continue;
    if (scripts.has(entry)) continue;
    violations.push(
      `${workspace}: entry "${entry}" is not a package export, script target, or src/schema/relations.ts`,
    );
  }
}

if (violations.length > 0) {
  console.error('knip.json validation failed:\n' + violations.map((v) => `  - ${v}`).join('\n'));
  process.exit(1);
}
console.log('knip.json validation passed.');
