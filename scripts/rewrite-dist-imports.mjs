#!/usr/bin/env node
/**
 * Rewrite publish-time import specifiers in a built `dist/` directory.
 *
 * Two jobs:
 * 1. Extensionless relative imports (`./foo`, `../bar`) get the Node ESM
 *    `.js` (or `/index.js`) suffix the published package needs.
 * 2. P-02 (audit 2026-10-18) — the intra-package `@ai/*` alias (used in
 *    source for readability) is rewritten back to a relative specifier in
 *    both `.js` and `.d.ts` outputs, so published code/types never expose a
 *    consumer-unresolvable alias.
 */
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.argv[2] ?? 'dist');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function resolveImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [`${base}.js`, path.join(base, 'index.js')];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function rewriteSpecifier(file, specifier) {
  if (!specifier.startsWith('.') || path.extname(specifier)) return specifier;
  const resolved = resolveImport(file, specifier);
  if (!resolved) return specifier;
  return `${specifier}/${path.basename(resolved)}`
    .replace(/\/index\.js$/, '/index.js')
    .replace(/\/([^/]+)\/\1\.js$/, '/$1.js');
}

/** Map `@ai/<subpath>` onto the built file and return a relative specifier. */
function rewriteAiSpecifier(file, specifier, { keepJsExtension }) {
  const rel = specifier.slice('@ai/'.length);
  const base = path.join(distDir, rel);
  const candidates = [`${base}.js`, path.join(base, 'index.js')];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) return specifier;
  let relative = path.relative(path.dirname(file), resolved).split(path.sep).join('/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return keepJsExtension ? relative : relative.replace(/\.js$/, '');
}

if (!fs.existsSync(distDir)) {
  console.error(`Distribution directory does not exist: ${distDir}`);
  process.exit(1);
}

const files = walk(distDir).filter((file) => file.endsWith('.js') || file.endsWith('.d.ts'));
const importPattern = /(from\s*["']|import\s*\(\s*["']|import\s*["'])([^"']+)(["'])/g;

for (const file of files) {
  const isDeclaration = file.endsWith('.d.ts');
  const source = fs.readFileSync(file, 'utf8');
  const rewritten = source.replace(importPattern, (match, prefix, specifier, quote) => {
    if (specifier.startsWith('@ai/')) {
      return `${prefix}${rewriteAiSpecifier(file, specifier, { keepJsExtension: !isDeclaration })}${quote}`;
    }
    if (isDeclaration) return match;
    const next = rewriteSpecifier(file, specifier);
    return `${prefix}${next}${quote}`;
  });
  if (rewritten !== source) fs.writeFileSync(file, rewritten);
}

console.log(`Rewrote publish imports in ${files.length} JavaScript/declaration files under ${distDir}`);
