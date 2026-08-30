import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { assertMigrationPlanIsConsistent, buildMigrationPlan } from '../src/migration-plan';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'kestrel-migration-plan-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'meta'));
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ entries: [{ tag: '0001_init' }] }));
  for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content);
  return dir;
}

describe('migration plan', () => {
  it('maps journal entries to files and computes hashes', () => {
    const plan = buildMigrationPlan(fixture({ '0001_init.sql': 'CREATE TABLE probe (id text);' }));
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]?.file).toBe('0001_init.sql');
    expect(plan.entries[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(() => assertMigrationPlanIsConsistent(plan)).not.toThrow();
  });

  it('reports missing and unjournaled files', () => {
    const dir = fixture({ '0002_untracked.sql': 'SELECT 1;' });
    const plan = buildMigrationPlan(dir);
    expect(plan.missingTags).toEqual(['0001_init']);
    expect(plan.unjournaledFiles).toEqual(['0002_untracked.sql']);
    expect(() => assertMigrationPlanIsConsistent(plan)).toThrow(/Missing migration files/);
  });
});
