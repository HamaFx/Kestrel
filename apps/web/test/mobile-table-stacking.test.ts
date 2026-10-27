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

// @vitest-environment node
// SPDX-License-Identifier: Apache-2.0

// Phone contract for data tables.
//
// Every table in the app used to be a desktop table inside an `overflow-x-auto`
// wrapper: on a 375px viewport the user got a sliver of the first column and a
// scrollbar inside a page that never scrolls sideways. The fix is the
// `table-stack` opt-in in globals.css, and this file is what stops the next
// table from being added without it.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = resolve(process.cwd(), 'src/app');
const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return entry.endsWith('.tsx') ? [full] : [];
  });
}

const files = walk(appRoot);
const tableFiles = files.filter((file) => /<table[\s>]/.test(readFileSync(file, 'utf8')));
const rel = (file: string) => relative(process.cwd(), file);

describe('stacked tables on phones', () => {
  it('finds the tables it is meant to police', () => {
    // A guard over an empty set is worse than no guard: fail loudly if the
    // scan stops matching (moved directory, renamed extension, …).
    expect(tableFiles.length).toBeGreaterThanOrEqual(10);
  });

  it('makes every table opt into the stacked layout', () => {
    const missing = tableFiles.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return !/<table[^>]*className="[^"]*table-stack/.test(source);
    });

    expect(
      missing.map(rel),
      'add className="table-stack …" (and data-label on the cells) or explain why the table must scroll',
    ).toEqual([]);
  });

  it('labels the cells so a stacked row still says what each value is', () => {
    for (const file of tableFiles) {
      const source = readFileSync(file, 'utf8');
      const headers = (source.match(/<th[\s>]/g) ?? []).length;
      const labels = (source.match(/data-label=/g) ?? []).length;

      // One unlabelled cell per row is expected — the row's identity (a symbol,
      // a version, a run id) renders as the card title via `row-primary`.
      expect(
        labels,
        `${rel(file)} has ${headers} columns but only ${labels} data-label attributes`,
      ).toBeGreaterThanOrEqual(Math.max(1, headers - 1));
    }
  });
});

describe('the stacked-table CSS contract', () => {
  it('only applies below the md breakpoint', () => {
    // The rules must not leak onto the desktop layout, where the table is the
    // better presentation.
    expect(css).toContain('@media (max-width: 767.98px)');
    const block = css.slice(css.indexOf('.table-stack'));
    expect(block).toContain('display: block');
    expect(block).toContain('min-width: 0');
  });

  it('hides the header row visually but keeps it for assistive tech', () => {
    const block = css.slice(css.indexOf('.table-stack thead'));
    expect(block).toContain('clip-path: inset(50%)');
    // Not `display: none` — the header still labels the cells for a reader.
    expect(block.slice(0, 400)).not.toContain('display: none');
  });

  it('prints the column name from the cell itself', () => {
    expect(css).toContain('content: attr(data-label)');
    expect(css).toContain('.table-stack td:not([data-label])::before');
  });

  it('renders full-width rows for empty states', () => {
    expect(css).toContain('.table-stack td[colspan]');
  });
});
