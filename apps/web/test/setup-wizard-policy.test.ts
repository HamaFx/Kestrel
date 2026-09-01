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

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseFlags } from '../../../scripts/setup/index.mjs';
import { upsertEnvFile } from '../../../scripts/setup/lib/env.mjs';
import { MARKET_DATA_PROVIDERS, parseMarketFlag } from '../../../scripts/setup/lib/market-data.mjs';
import { loadSecretTemplate, resolveTemplateValue } from '../../../scripts/setup/lib/secrets.mjs';
import * as configStep from '../../../scripts/setup/steps/config.mjs';
import * as detectStep from '../../../scripts/setup/steps/detect-existing.mjs';
import * as installStep from '../../../scripts/setup/steps/install.mjs';
import * as launchStep from '../../../scripts/setup/steps/launch.mjs';
import { parseApiKeys } from '../../../scripts/setup/steps/market-data.mjs';
import * as marketStep from '../../../scripts/setup/steps/market-data.mjs';
import * as modeStep from '../../../scripts/setup/steps/mode.mjs';
import * as prereqsStep from '../../../scripts/setup/steps/prereqs.mjs';

const root = resolve(process.cwd(), '../..');

const REQUIRED_SECRETS = [
  'POSTGRES_PASSWORD',
  'BACKUP_INTERVAL_SECONDS',
  'BACKUP_RETENTION_DAYS',
  'BACKUP_MAX_AGE_SECONDS',
  'LANGFUSE_NEXTAUTH_SECRET',
  'LANGFUSE_SALT',
  'LANGFUSE_ENCRYPTION_KEY',
  'LANGFUSE_CLICKHOUSE_PASSWORD',
  'LANGFUSE_REDIS_PASSWORD',
  'LANGFUSE_S3_ACCESS_KEY_ID',
  'LANGFUSE_S3_SECRET_ACCESS_KEY',
  'AUTH_SECRET',
  'NEXTAUTH_URL',
  'CRON_SECRET',
  'ENCRYPTION_SECRET',
  'BYOK_ENABLED',
  'MULTI_USER_ENABLED',
  'REGISTRATION_MODE',
  'KESTREL_ENABLE_RLS',
];

describe('setup wizard structure', () => {
  it('exports run() and a title from every step module', () => {
    const steps = [
      prereqsStep,
      modeStep,
      detectStep,
      marketStep,
      configStep,
      installStep,
      launchStep,
    ];
    for (const step of steps) {
      expect(typeof step.run, `${step.title ?? 'step'} exports run`).toBe('function');
      expect(typeof step.title, `${step.title ?? 'step'} exports title`).toBe('string');
      expect(typeof step.hint, `${step.title ?? 'step'} exports hint`).toBe('string');
    }
  });

  it('offers the four documented market data providers', () => {
    const ids = MARKET_DATA_PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(['finnhub', 'marketaux', 'fred', 'alphavantage']);
    for (const p of MARKET_DATA_PROVIDERS) {
      expect(p.envKey).toMatch(/^[A-Z0-9_]+_API_KEY$/);
      expect(typeof p.url).toBe('string');
    }
  });

  it('parses the --market flag into provider ids (case/whitespace tolerant)', () => {
    expect(parseMarketFlag('finnhub,fred')).toEqual(['finnhub', 'fred']);
    expect(parseMarketFlag(' Finnhub , MARKETAUX ')).toEqual(['finnhub', 'marketaux']);
    expect(parseMarketFlag('bogus')).toEqual([]);
    expect(parseMarketFlag('')).toEqual([]);
  });

  it('parses --api-key=ID:VALUE into the env key map (C2)', () => {
    const { byEnvKey, ids } = parseApiKeys([
      'finnhub:finnhubsecret1',
      'bogus:x',
      'fred:fredsecret-by',
    ]);
    expect(byEnvKey.FINNHUB_API_KEY).toBe('finnhubsecret1');
    expect(byEnvKey.FRED_API_KEY).toBe('fredsecret-by');
    expect(byEnvKey.BOGUS_API_KEY).toBeUndefined(); // unknown provider ignored
    expect(ids).toContain('finnhub');
    expect(ids).toContain('fred');
    expect(ids.length).toBe(2);
  });

  it('ignores --api-key specs without a colon or value (C2)', () => {
    const { byEnvKey, ids } = parseApiKeys(['finnhub', 'finnhub:', 'finnhub:secret']);
    expect(byEnvKey.FINNHUB_API_KEY).toBe('secret');
    expect(ids).toEqual(['finnhub']);
  });

  it('keeps graceful abort messaging and exit code 130 in the entry point', () => {
    const source = readFileSync(resolve(root, 'scripts/setup/index.mjs'), 'utf8');
    expect(source).toContain('Setup interrupted. Re-run anytime: pnpm setup');
    expect(source).toContain('return 130');
  });

  it('keeps the documented node scripts/setup.mjs invocation as a thin wrapper', () => {
    const wrapper = readFileSync(resolve(root, 'scripts/setup.mjs'), 'utf8');
    expect(wrapper).toContain("import { main } from './setup/index.mjs'");
    expect(wrapper).toContain('process.exitCode = code');
  });

  it('gates the Langfuse stack behind the opt-in observability profile', () => {
    const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8');
    // Split top-level `  name:` blocks so each service is checked in isolation.
    const blocks = new Map();
    let current = null;
    for (const line of compose.split('\n')) {
      const match = line.match(/^  ([a-z0-9-]+):/);
      if (match) current = match[1];
      if (current) blocks.set(current, [...(blocks.get(current) ?? []), line]);
    }
    for (const service of ['langfuse', 'langfuse-worker', 'clickhouse', 'redis', 'minio']) {
      expect(
        blocks.get(service)?.join('\n'),
        `${service} must be defined in docker-compose.yml`,
      ).toBeDefined();
      expect(
        blocks.get(service)?.join('\n'),
        `${service} must live behind the observability profile`,
      ).toContain('profiles: ["observability"]');
    }
    // The default `docker compose up` (no profile) must not publish Langfuse.
    expect(compose).toContain(
      '# Langfuse is opt-in: use `docker compose --profile observability up -d`.',
    );
  });

  it('guides the user through connecting the Langfuse project keys (the non-automatable step)', () => {
    const launch = readFileSync(resolve(root, 'scripts/setup/steps/launch.mjs'), 'utf8');
    expect(launch).toContain('Connect your app to Langfuse');
    expect(launch).toContain('LANGFUSE_PUBLIC_KEY=pk-');
    expect(launch).toContain('LANGFUSE_SECRET_KEY=sk-');
    expect(launch).toContain('docker compose restart app');
    // The endpoint is deterministic, so the wizard records it automatically
    // (the internal Compose URL the app exports to, not the host-facing port).
    expect(launch).toContain("LANGFUSE_BASE_URL: 'http://langfuse:3000'");
  });
});

describe('setup wizard flags', () => {
  it('parses long and short flags', () => {
    const flags = parseFlags([
      '--mode=docker',
      '--market=finnhub,fred',
      '--fresh',
      '--skip-install',
      '--no-launch',
      '--yes',
      '--dry-run',
      '--json',
      '--no-color',
    ]);
    expect(flags.mode).toBe('docker');
    expect(flags.market).toBe('finnhub,fred');
    expect(flags.fresh).toBe(true);
    expect(flags.skipInstall).toBe(true);
    expect(flags.noLaunch).toBe(true);
    expect(flags.yes).toBe(true);
    expect(flags.dryRun).toBe(true);
    expect(flags.json).toBe(true);
    expect(flags.noColor).toBe(true);
    expect(flags.help).toBe(false);
  });

  it('parses space-separated flag values and aliases', () => {
    const flags = parseFlags(['--mode', 'simple', '-y', '-h']);
    expect(flags.mode).toBe('simple');
    expect(flags.yes).toBe(true);
    expect(flags.help).toBe(true);
  });

  it('marks --mode/--market/--api-key with a missing value (B3)', () => {
    const modeFlags = parseFlags(['--mode']);
    expect(modeFlags.mode).toBeNull();
    expect(modeFlags.modeMissing).toBe(true);

    const marketFlags = parseFlags(['--market']);
    expect(marketFlags.market).toBeNull();
    expect(marketFlags.marketMissing).toBe(true);

    const apiKeyFlags = parseFlags(['--api-key']);
    expect(apiKeyFlags.apiKeyMissing).toBe(true);

    // A value that looks like a flag is NOT consumed as the mode value.
    const guarded = parseFlags(['--mode', '--yes', 'simple']);
    expect(guarded.modeMissing).toBe(true);
    expect(guarded.yes).toBe(true);
  });

  it('returns a non-zero code when --mode has no value (B3)', async () => {
    const { main } = await import('../../../scripts/setup/index.mjs');
    const silent = { write: () => {}, line: () => {}, isTTY: false };
    const code = await main(['--mode'], { io: silent });
    expect(code).toBe(1);
  });

  it('rejects unknown modes at the main() level', async () => {
    const { main } = await import('../../../scripts/setup/index.mjs');
    // Inject a silent io so the error message does not pollute test output.
    const silent = { write: () => {}, line: () => {}, isTTY: false };
    const code = await main(['--mode=banana'], { io: silent });
    expect(code).toBe(1);
  });

  it('emits a machine-readable JSON result with --json', async () => {
    const { main } = await import('../../../scripts/setup/index.mjs');
    const silent = { write: () => {}, line: () => {}, isTTY: false };
    const jsonOut = { buffer: '', write: (s: string) => (jsonOut.buffer += s) };
    const code = await main(['--mode=simple', '--dry-run', '--json'], {
      io: silent,
      jsonStream: jsonOut,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(jsonOut.buffer);
    expect(parsed.ok).toBe(true);
    expect(parsed.mode).toBe('simple');
    expect(parsed.dryRun).toBe(true);
    expect(parsed.configFile).toBe('.env.local');
    expect(Array.isArray(parsed.marketProviders)).toBe(true);
    expect(parsed.langfuseEnabled).toBe(false); // opt-in, off by default
  }, 15000);

  it('emits a JSON error for invalid modes with --json', async () => {
    const { main } = await import('../../../scripts/setup/index.mjs');
    const silent = { write: () => {}, line: () => {}, isTTY: false };
    const jsonOut = { buffer: '', write: (s: string) => (jsonOut.buffer += s) };
    const code = await main(['--mode=banana', '--json'], { io: silent, jsonStream: jsonOut });
    expect(code).toBe(1);
    const parsed = JSON.parse(jsonOut.buffer);
    expect(parsed.ok).toBe(false);
    expect(String(parsed.error)).toContain('banana');
  }, 15000);
});

describe('secret template — single source of truth', () => {
  let template: Record<string, unknown>;

  beforeEach(() => {
    template = loadSecretTemplate();
  });

  it('covers every secret docker-compose.yml expects', () => {
    const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8');
    const refs = [...compose.matchAll(/\$\{([A-Z0-9_]+)(?::-(?:[^}]*))?\}/g)].map((m) => m[1]);
    for (const key of refs) {
      if (key === 'POSTGRES_PUBLISHED_PORT' || key === 'APP_PUBLISHED_PORT') continue; // host ports, not secrets
      expect(template, `docker-compose.yml references ${key}`).toHaveProperty(key);
    }
  });

  it('includes every canonical secret', () => {
    for (const key of REQUIRED_SECRETS) {
      expect(template, `template must define ${key}`).toHaveProperty(key);
    }
  });

  it('lists every template key in the generate-env.mjs section layout', () => {
    const source = readFileSync(resolve(root, 'scripts/setup/lib/generate-env.mjs'), 'utf8');
    for (const key of Object.keys(template)) {
      expect(source, `generate-env.mjs must render ${key}`).toContain(`'${key}'`);
    }
  });
});

describe('generate-env.mjs CLI', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(resolve(tmpdir(), 'kestrel-genenv-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a .env with all template keys and 0600 permissions', () => {
    const target = resolve(dir, '.env');
    execFileSync('node', [resolve(root, 'scripts/setup/lib/generate-env.mjs'), '--file', target]);

    const content = readFileSync(target, 'utf8');
    for (const key of REQUIRED_SECRETS) {
      expect(content, `fresh .env contains ${key}`).toContain(`${key}=`);
    }
    expect(content).toContain('DO NOT commit this file');
    expect(statSync(target).mode & 0o777).toBe(0o600);
  });

  it('never overwrites an existing file with --if-missing', () => {
    const target = resolve(dir, '.env');
    writeFileSync(target, 'A=1\n');
    const before = readFileSync(target, 'utf8');

    execFileSync('node', [
      resolve(root, 'scripts/setup/lib/generate-env.mjs'),
      '--file',
      target,
      '--if-missing',
    ]);
    expect(readFileSync(target, 'utf8')).toBe(before);
  });

  it('completes missing secrets in an existing partial file', () => {
    const target = resolve(dir, '.env');
    writeFileSync(target, 'AUTH_SECRET=already-set\n');
    execFileSync('node', [resolve(root, 'scripts/setup/lib/generate-env.mjs'), '--file', target]);

    const content = readFileSync(target, 'utf8');
    expect(content).toContain('AUTH_SECRET=already-set');
    expect(content).toContain('POSTGRES_PASSWORD=');
  });

  it('fresh-start on a complete .env rewrites all secrets instead of no-op (B1)', () => {
    const target = resolve(dir, '.env');
    // Complete file with a known AUTH_SECRET.
    const template = loadSecretTemplate();
    let content = '';
    for (const [k, v] of Object.entries(template)) {
      content += `${k}=${typeof v === 'string' ? v : '0123456789abcdef0123456789abcdef'}\n`;
    }
    writeFileSync(target, content);

    // Mimic config.mjs fresh path: regenerate ALL template keys + replace.
    const all = {};
    for (const [k, v] of Object.entries(template)) all[k] = resolveTemplateValue(v);
    const result = upsertEnvFile(target, all, { backup: false, replace: true });

    // Previously this was a silent no-op (missing=0 → values={} → replace dropped
    // everything with changed=false). Now it must report a change and rewrite.
    expect(result.changed).toBe(true);
    const after = readFileSync(target, 'utf8');
    expect(after).toContain('AUTH_SECRET=');
    expect(Object.keys(all).length).toBeGreaterThan(10);
  });

  it('fresh-start on a partial .env preserves the full key set (B1)', () => {
    const target = resolve(dir, '.env');
    writeFileSync(target, 'POSTGRES_PASSWORD=my-existing\n');

    const template = loadSecretTemplate();
    const all = {};
    for (const [k, v] of Object.entries(template)) all[k] = resolveTemplateValue(v);
    const result = upsertEnvFile(target, all, { backup: false, replace: true });

    const after = readFileSync(target, 'utf8');
    // Every canonical key is present after a fresh write (no silent wipe).
    for (const key of Object.keys(template)) {
      expect(after, `${key} present after fresh`).toContain(`${key}=`);
    }
    expect(result.diff.some((d) => d.key === 'POSTGRES_PASSWORD')).toBe(true);
  });

  it('migrates the legacy RLS env key while preserving its value', () => {
    const target = resolve(dir, '.env');
    writeFileSync(target, 'HAMAFX_ENABLE_RLS=1\n');
    execFileSync('node', [resolve(root, 'scripts/setup/lib/generate-env.mjs'), '--file', target]);

    const content = readFileSync(target, 'utf8');
    expect(content).toContain('KESTREL_ENABLE_RLS=1');
    expect(content).not.toContain('HAMAFX_ENABLE_RLS=');
  });

  it('removes a deprecated alias even when canonical env keys are complete', () => {
    const target = resolve(dir, '.env');
    execFileSync('node', [resolve(root, 'scripts/setup/lib/generate-env.mjs'), '--file', target]);
    writeFileSync(target, `${readFileSync(target, 'utf8')}HAMAFX_ENABLE_RLS=1\n`);

    execFileSync('node', [resolve(root, 'scripts/setup/lib/generate-env.mjs'), '--file', target]);

    const content = readFileSync(target, 'utf8');
    expect(content).not.toContain('HAMAFX_ENABLE_RLS=');
    expect(content).toContain('KESTREL_ENABLE_RLS=0');
  });
});

describe('docker/init-secrets.sh delegation', () => {
  it('delegates to the single source of truth generator', () => {
    const script = readFileSync(resolve(root, 'docker/init-secrets.sh'), 'utf8');
    expect(script).toContain('generate-env.mjs');
    expect(script).toContain('--if-missing');
    expect(script).toContain('exec node');
    expect(script).not.toContain('openssl');
    expect(script).not.toContain('rand_hex()');
    expect(script).not.toContain('POSTGRES_PASSWORD=');
  });
});
