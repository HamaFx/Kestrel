import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach } from 'vitest';

import { applyMigrations, closePGliteDb, getPGliteDb } from '../src/pglite-client';

export function useMigratedPGliteFixture(prefix = 'kestrel-pglite-') {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), prefix));
    await applyMigrations(dataDir);
  });

  afterEach(async () => {
    await closePGliteDb();
    rmSync(dataDir, { recursive: true, force: true });
  });

  return {
    get dataDir() {
      return dataDir;
    },
    getDb: () => getPGliteDb(dataDir),
  };
}
