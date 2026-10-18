import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveBuildId, upsertEnvLine } from '../scripts/set-build-id.mjs';

describe('set-build-id cache determinism', () => {
  let tempDir = '';

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = '';
  });

  it('returns a deterministic build id without wall-clock epoch when tree is clean', () => {
    const id1 = resolveBuildId({ sha: 'a1b2c3d', dirtyHash: '', forceEpoch: false });
    const id2 = resolveBuildId({ sha: 'a1b2c3d', dirtyHash: '', forceEpoch: false });
    expect(id1).toBe('a1b2c3d');
    expect(id2).toBe('a1b2c3d');
  });

  it('appends dirty tree hash when working tree has uncommitted changes', () => {
    const id = resolveBuildId({ sha: 'a1b2c3d', dirtyHash: 'deadbeef', forceEpoch: false });
    expect(id).toBe('a1b2c3d-deadbeef');
  });

  it('does not rewrite env file when key=value is already up to date', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'kestrel-build-id-'));
    const envFile = join(tempDir, '.env.production.local');
    writeFileSync(envFile, 'AUTH_MODE=normal\nNEXT_PUBLIC_BUILD_ID=a1b2c3d\n', 'utf8');

    const beforeMtime = statSync(envFile).mtimeMs;
    await new Promise((r) => setTimeout(r, 25));

    const changed = upsertEnvLine(envFile, 'NEXT_PUBLIC_BUILD_ID', 'a1b2c3d');
    const afterMtime = statSync(envFile).mtimeMs;

    expect(changed).toBe(false);
    expect(afterMtime).toBe(beforeMtime);
    expect(readFileSync(envFile, 'utf8')).toBe('AUTH_MODE=normal\nNEXT_PUBLIC_BUILD_ID=a1b2c3d\n');
  });
});
