#!/usr/bin/env node
/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Validate plain-text figures in the documentation.
//
// A figure is a fenced block whose first line opens with `+--- [ TITLE ] ---+`,
// the dialect from mdxcn.dev. The frame only aligns if every line has the same
// display width and the glyphs come from the sanctioned set, so this guard
// catches the two ways it breaks: a hand-rolled box drawing character or an
// emoji, and a line whose padding drifted. See docs/figures.md.

import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const roots = ['docs', 'README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'SUPPORT.md', 'DEPLOY.md'];

/** Symbols the official mdxcn fences draw with. Printable ASCII is allowed too. */
const SYMBOLS = new Set([
  '●',
  '○',
  '◐',
  '│',
  '├',
  '└',
  '─',
  '▶',
  '▾',
  '✓',
  '×',
  '·',
  '–',
  '—',
  '→',
  '−',
  '⌘',
  // shaded bars and sparklines
  '█',
  '▓',
  '▒',
  '░',
  '▁',
  '▂',
  '▃',
  '▄',
  '▅',
  '▆',
  '▇',
]);

function sanctioned(glyph) {
  const code = glyph.codePointAt(0) ?? 0;
  return (code >= 0x20 && code <= 0x7e) || SYMBOLS.has(glyph);
}

const WIDE = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
];

function displayWidth(line) {
  let width = 0;
  for (const glyph of line) {
    const code = glyph.codePointAt(0) ?? 0;
    if (wide(code)) {
      width += 2;
    } else if (!isMark(glyph)) {
      width += 1;
    }
  }
  return width;
}

function wide(code) {
  return WIDE.some(([from, to]) => code >= from && code <= to);
}

function isMark(glyph) {
  return /[\u0300-\u036f\ufe00-\ufe0f\u200b-\u200d]/u.test(glyph);
}

/** True when the block is a figure rather than a shell session or a diff. */
function isFigure(lines) {
  const first = lines[0] ?? '';
  return /^\+(?:-+ \[ .+ \] -+|-+)\+$/.test(first);
}

function checkFigure(path, startLine, lines) {
  const errors = [];
  const where = (offset) => `${path}:${startLine + offset}`;
  const widths = lines.map((line) => displayWidth(line));
  const expected = widths[0];

  lines.forEach((line, index) => {
    if (widths[index] !== expected) {
      errors.push(
        `${where(index)} is ${widths[index]} cells wide, the frame is ${expected} (${JSON.stringify(line)})`,
      );
    }

    for (const glyph of line) {
      if (!sanctioned(glyph) && !isMark(glyph)) {
        errors.push(
          `${where(index)} uses ${JSON.stringify(glyph)} (U+${(glyph.codePointAt(0) ?? 0)
            .toString(16)
            .toUpperCase()
            .padStart(4, '0')}), which is outside the mdxcn glyph set`,
        );
      }
    }

    if (!line.startsWith('|') && !line.startsWith('+')) {
      errors.push(`${where(index)} must start with "|" or "+" to keep the frame closed`);
    }
    if (!line.endsWith('|') && !line.endsWith('+')) {
      errors.push(`${where(index)} must end with "|" or "+" to keep the frame closed`);
    }
  });

  return errors;
}

async function walk(target) {
  let entries;
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const full = join(target, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

const files = (await Promise.all(roots.map((entry) => walk(resolve(root, entry))))).flat();

const errors = [];
let figures = 0;

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const lines = source.split('\n');
  const shown = relative(root, file);

  let open = null;
  for (const [index, line] of lines.entries()) {
    const fence = line.match(/^(`{3,})(\S*)\s*$/);
    if (open === null) {
      if (fence) {
        open = { marker: fence[1], start: index + 1, body: [] };
      }
      continue;
    }

    if (line.startsWith(open.marker) && line.trim() === open.marker) {
      if (isFigure(open.body)) {
        figures += 1;
        errors.push(...checkFigure(shown, open.start + 1, open.body));
      }
      open = null;
      continue;
    }

    open.body.push(line);
  }
}

if (figures === 0) {
  process.stderr.write(
    '✗ No figures found. The detector or the docs layout changed, so this guard is not checking anything.\n',
  );
  process.exit(1);
}

if (errors.length > 0) {
  for (const error of errors) {
    process.stderr.write(`✗ ${error}\n`);
  }
  process.stderr.write(
    `\n${errors.length} problem(s) in ${figures} figure(s). See docs/figures.md.\n`,
  );
  process.exit(1);
}

process.stdout.write(`✓ ${figures} documented figure(s) align.\n`);
