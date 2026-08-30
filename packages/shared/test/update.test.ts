import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  compareVersions,
  detectMode,
  getInstalledVersion,
  isStableRelease,
  main,
  normalizeVersion,
  parseFlags,
  replaceSource,
  validateReleaseRoot,
} from '../../scripts/update.mjs';

describe('Kestrel updater', () => {
  it('parses supported flags', () => {
    expect(parseFlags(['--dry-run', '--yes'])).toEqual({ dryRun: true, yes: true, help: false });
  });

  it('rejects unknown flags', () => {
    expect(() => parseFlags(['--main'])).toThrow('Unknown option: --main');
  });

  it('compares stable and prerelease versions', () => {
    expect(normalizeVersion('v1.2.3')).toMatchObject({ version: '1.2.3', prerelease: null });
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBe(-1);
  });

  it('accepts only stable releases', () => {
    expect(isStableRelease({ tag_name: 'v1.0.0', draft: false, prerelease: false })).toBe(true);
    expect(isStableRelease({ tag_name: 'v1.0.0-beta.1', draft: false, prerelease: true })).toBe(
      false,
    );
    expect(isStableRelease({ tag_name: 'v1.0.0', draft: true, prerelease: false })).toBe(false);
  });

  it('detects Simple and Docker installations', () => {
    expect(detectMode(process.cwd())).toBe('simple');
  });

  it('rejects a non-Kestrel release root', () => {
    expect(() => validateReleaseRoot(process.cwd())).toThrow('not a Kestrel release');
  });

  it('replaces source while preserving protected files', () => {
    const root = mkdtempSync(join(tmpdir(), 'kestrel-update-root-'));
    const release = mkdtempSync(join(tmpdir(), 'kestrel-update-release-'));
    writeFileSync(join(root, 'package.json'), '{"name":"kestrel","version":"0.1.0"}');
    writeFileSync(join(root, '.env'), 'SECRET=keep');
    mkdirSync(join(root, '.kestrel'), { recursive: true });
    writeFileSync(join(root, '.kestrel', 'data.txt'), 'data');
    writeFileSync(join(release, 'package.json'), '{"name":"kestrel","version":"0.2.0"}');
    writeFileSync(join(release, 'new-file.txt'), 'new');

    replaceSource(root, release);

    expect(readFileSync(join(root, 'package.json'), 'utf8')).toContain('0.2.0');
    expect(readFileSync(join(root, 'new-file.txt'), 'utf8')).toBe('new');
    expect(readFileSync(join(root, '.env'), 'utf8')).toBe('SECRET=keep');
    expect(readFileSync(join(root, '.kestrel', 'data.txt'), 'utf8')).toBe('data');
  });

  it('reads the current application version', () => {
    expect(getInstalledVersion(process.cwd())).toMatchObject({ version: '0.0.0' });
  });

  it('reports GitHub failures without changing files', async () => {
    await expect(
      main(['--dry-run'], {
        root: process.cwd(),
        output: () => {},
        fetchImpl: async () => ({ ok: false, status: 503, statusText: 'Unavailable' }),
      }),
    ).rejects.toThrow('GitHub could not be reached');
  });

  it('reports no update without changing files', async () => {
    const output: string[] = [];
    const code = await main(['--dry-run'], {
      root: process.cwd(),
      runCommandResult: async () => ({ code: 0, stdout: '', stderr: '' }),
      output: (line: string) => output.push(line),
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ tag_name: 'v0.1.0', draft: false, prerelease: false }),
      }),
    });
    expect(code).toBe(0);
    expect(output).toContain('An update is available: v0.0.0 → v0.1.0');
  });

  it('reports an available update in dry-run mode', async () => {
    const output: string[] = [];
    const code = await main(['--dry-run'], {
      root: process.cwd(),
      runCommandResult: async () => ({ code: 0, stdout: '', stderr: '' }),
      output: (line: string) => output.push(line),
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ tag_name: 'v0.2.0', draft: false, prerelease: false }),
      }),
    });
    expect(code).toBe(0);
    expect(output).toContain('An update is available: v0.0.0 → v0.2.0');
    expect(output).toContain('Dry run: no files, backups, databases, or services were changed.');
  });
});
