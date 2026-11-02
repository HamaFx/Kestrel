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

// SPDX-License-Identifier: Apache-2.0

// Audit 2026-10-31 (R7 follow-up): the journal-reference lookup reads the
// admin connection (a cron route has no tenant scope), flattens
// `screenshot_url` + `attachments` into raw references, and reports its row
// bound so the sweep can keep a user's objects instead of guessing.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  journalReferencesFromRows,
  loadJournalReferences,
  MAX_JOURNAL_REFERENCE_ROWS,
} from '@/app/api/cron/cleanup-uploads/journal-references';

const mocks = vi.hoisted(() => ({
  withAdminDb: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('@/lib/services/db', async () => {
  const { schema } = await import('@kestrel/db');
  return { schema, withAdminDb: mocks.withAdminDb };
});

interface FakeRow {
  screenshotUrl: string | null;
  attachments: string[] | null;
}

function installFakeDb(rows: FakeRow[]): void {
  mocks.withAdminDb.mockImplementation(async (work: (db: unknown) => Promise<unknown>) => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: (value: number) => {
              mocks.limit(value);
              return Promise.resolve(rows);
            },
          }),
        }),
      }),
    };
    return work(db);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  installFakeDb([]);
});

describe('loadJournalReferences', () => {
  it('returns nothing without touching the database when no day is expired', async () => {
    const lookup = await loadJournalReferences('user-a', []);

    expect(lookup).toEqual({ references: [], truncated: false });
    expect(mocks.withAdminDb).not.toHaveBeenCalled();
  });

  it('flattens screenshot_url and every attachment into raw references', async () => {
    installFakeDb([
      {
        screenshotUrl: '/api/uploads/user-a/2026-10-15/abc-chart.webp',
        attachments: ['user-a/2026-10-15/def-notes.png', 'https://example.com/foreign.png'],
      },
      { screenshotUrl: null, attachments: ['user-a/2026-10-25/ghi-plan.webp'] },
    ]);

    const lookup = await loadJournalReferences('user-a', ['2026-10-15', '2026-10-25']);

    expect(lookup.truncated).toBe(false);
    expect(lookup.references).toEqual([
      '/api/uploads/user-a/2026-10-15/abc-chart.webp',
      'user-a/2026-10-15/def-notes.png',
      'https://example.com/foreign.png',
      'user-a/2026-10-25/ghi-plan.webp',
    ]);
  });

  it('reads on the admin connection and caps the page at the row bound', async () => {
    installFakeDb([]);

    await loadJournalReferences('user-a', ['2026-10-15']);

    expect(mocks.withAdminDb).toHaveBeenCalledTimes(1);
    expect(mocks.limit).toHaveBeenCalledWith(MAX_JOURNAL_REFERENCE_ROWS + 1);
  });

  it('reports truncation so the sweep keeps that user’s objects', async () => {
    installFakeDb(
      Array.from({ length: MAX_JOURNAL_REFERENCE_ROWS + 1 }, () => ({
        screenshotUrl: null,
        attachments: ['user-a/2026-10-15/kept.webp'],
      })),
    );

    const lookup = await loadJournalReferences('user-a', ['2026-10-15']);

    expect(lookup.truncated).toBe(true);
    expect(lookup.references).toHaveLength(MAX_JOURNAL_REFERENCE_ROWS);
  });
});

describe('journalReferencesFromRows', () => {
  it('skips null and empty values', () => {
    expect(
      journalReferencesFromRows(
        [
          { screenshotUrl: null, attachments: ['kept.png', ''] },
          { screenshotUrl: 'kept.webp', attachments: null },
        ],
        false,
      ),
    ).toEqual({ references: ['kept.png', 'kept.webp'], truncated: false });
  });
});
