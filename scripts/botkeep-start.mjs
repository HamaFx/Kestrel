#!/usr/bin/env node
/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Botkeep Founder Free & Cloud PaaS Worker Launcher (`node scripts/botkeep-start.mjs`)
 *
 * Designed specifically for Botkeep Founder Free (2 GB shared RAM, 1.5 vCore,
 * 2 GB total storage, no expiry) and low-memory cloud VMs (GCP e2-micro)
 * without requiring GitHub Actions:
 *
 *   1. Auto-loads `.env.botkeep`, `.env.local`, or `.env` if present.
 *   2. Auto-populates boilerplate & derived worker environment variables
 *      (`NODE_ENV=production`, `WORKER_MODE=docker`, `MULTI_USER_ENABLED=1`,
 *      `KESTREL_ENABLE_RLS=1`, `ADMIN_DATABASE_URL` fallback, and HMAC-derived
 *      `WORKER_HEALTH_TOKEN` / `BIQUOTE_PROXY_TOKEN` / `AUTH_SECRET` /
 *      `CRON_SECRET` when not explicitly set) so you only need `DATABASE_URL`
 *      and `ENCRYPTION_SECRET` (plus `PRODUCTION_URL` + `CRON_SECRET` for light crons).
 *   3. Runs a slim worker-only install & build (`--filter @kestrel/worker...`)
 *      when `apps/worker/dist/index.js` is missing or out of date, then prunes
 *      devDependencies and the pnpm store so total disk usage stays ~180 MB
 *      (well inside Botkeep Founder Free's 2 GB storage limit).
 *   4. Runs an in-process Light Cron Poker loop for Vercel's `/api/cron/*`
 *      routes (`warm-cache`, `news`, `alerts`, `health-alerts`, `calendar`,
 *      `billing-dlq`, `cleanup-uploads`, `cleanup-tokens`, `cleanup-telemetry`)
 *      so host `systemd` timers and GitHub Actions are not needed.
 */

import { execSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const WORKER_DIST_ENTRY = resolve(ROOT, 'apps/worker/dist/index.js');
const WORKER_BUILT_SHA_FILE = resolve(ROOT, 'apps/worker/dist/.built-sha');

function log(level, msg, extra = {}) {
  const payload = {
    level,
    ts: new Date().toISOString(),
    component: 'botkeep-launcher',
    msg,
    ...extra,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

function loadDotEnvFiles() {
  const candidates = ['.env.botkeep', '.env.local', '.env'];
  for (const name of candidates) {
    const filePath = resolve(ROOT, name);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = val;
      }
    }
    log('info', `Loaded environment file ${name}`);
  }
}

function deriveSecret(seed, label, hexLen = 64) {
  return createHmac('sha256', seed).update(`kestrel:${label}`).digest('hex').slice(0, hexLen);
}

function applySmartEnvDefaults() {
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  process.env.WORKER_MODE = process.env.WORKER_MODE || 'docker';
  process.env.MULTI_USER_ENABLED = process.env.MULTI_USER_ENABLED || '1';
  process.env.KESTREL_ENABLE_RLS = process.env.KESTREL_ENABLE_RLS || '1';
  process.env.REGISTRATION_MODE = process.env.REGISTRATION_MODE || 'open';

  if (!process.env.NODE_OPTIONS) {
    process.env.NODE_OPTIONS = '--max-old-space-size=1024';
  }

  // Database URL aliases & admin/direct fallbacks
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (dbUrl && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = dbUrl;
  }
  if (dbUrl && !process.env.ADMIN_DATABASE_URL) {
    process.env.ADMIN_DATABASE_URL =
      process.env.DIRECT_URL || process.env.POSTGRES_URL_NON_POOLING || dbUrl;
  }
  if (dbUrl && !process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.ADMIN_DATABASE_URL || dbUrl;
  }

  // Production URL normalization for light cron pokes
  const appUrl = (
    process.env.PRODUCTION_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');
  if (appUrl) {
    process.env.PRODUCTION_URL = appUrl;
    if (!process.env.NEXT_PUBLIC_APP_URL) process.env.NEXT_PUBLIC_APP_URL = appUrl;
    if (!process.env.NEXTAUTH_URL) process.env.NEXTAUTH_URL = appUrl;
  }

  // Deterministic fallback secrets derived from ENCRYPTION_SECRET or DATABASE_URL
  const seed =
    process.env.ENCRYPTION_SECRET ||
    dbUrl ||
    randomBytes(32).toString('hex');

  const autoDerived = [];
  if (!process.env.WORKER_HEALTH_TOKEN) {
    process.env.WORKER_HEALTH_TOKEN = deriveSecret(seed, 'worker-health-token', 48);
    autoDerived.push('WORKER_HEALTH_TOKEN');
  }
  if (!process.env.BIQUOTE_PROXY_TOKEN) {
    process.env.BIQUOTE_PROXY_TOKEN = deriveSecret(seed, 'biquote-proxy-token', 48);
    autoDerived.push('BIQUOTE_PROXY_TOKEN');
  }
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    process.env.AUTH_SECRET = deriveSecret(seed, 'auth-secret', 64);
    autoDerived.push('AUTH_SECRET');
  }
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 16) {
    process.env.CRON_SECRET = deriveSecret(seed, 'cron-secret', 48);
    autoDerived.push('CRON_SECRET');
  }

  if (autoDerived.length > 0) {
    log('info', 'Auto-derived missing worker tokens from seed', { autoDerived });
  }
}

function getCurrentGitSha() {
  try {
    return execSync('git rev-parse --short=12 HEAD', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return process.env.DEPLOYED_SHA || 'botkeep-build';
  }
}

function maybeGitPull() {
  if (process.env.BOTKEEP_PULL_ON_START !== '1' && !process.argv.includes('--pull')) {
    return;
  }
  try {
    log('info', 'Checking origin/main for updates...');
    execSync('git fetch origin main --depth=1', { cwd: ROOT, stdio: 'inherit' });
    execSync('git reset --hard origin/main', { cwd: ROOT, stdio: 'inherit' });
  } catch (err) {
    log('warn', 'Git pull skipped or failed; continuing with current tree', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function ensureWorkerBuilt() {
  const currentSha = getCurrentGitSha();
  process.env.DEPLOYED_SHA =
    process.env.DEPLOYED_SHA && process.env.DEPLOYED_SHA !== 'unknown'
      ? process.env.DEPLOYED_SHA
      : currentSha;

  const builtSha = existsSync(WORKER_BUILT_SHA_FILE)
    ? readFileSync(WORKER_BUILT_SHA_FILE, 'utf8').trim()
    : '';

  const forceRebuild = process.argv.includes('--rebuild') || process.env.BOTKEEP_FORCE_REBUILD === '1';
  if (!forceRebuild && existsSync(WORKER_DIST_ENTRY) && builtSha === currentSha) {
    log('info', 'Worker bundle already up to date; skipping install & build', { sha: currentSha });
    return;
  }

  log('info', 'Building @kestrel/worker (slim worker-only install for 2 GB storage cap)...', {
    sha: currentSha,
  });

  const run = (cmd) => {
    log('info', `Running: ${cmd}`);
    execSync(cmd, {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        CI: 'true',
        NODE_OPTIONS: '--max-old-space-size=1024',
      },
    });
  };

  // 1. Install only packages required by @kestrel/worker (skips apps/web, Next.js, Playwright, Sharp)
  run('pnpm install --filter @kestrel/worker... --frozen-lockfile --config.confirmModulesPurge=false');

  // 2. Bundle @kestrel/worker into apps/worker/dist/index.js and apps/worker/dist/runner/cli.js
  run('pnpm --filter @kestrel/worker build');

  // 3. Stamp built SHA so future container restarts boot in <1s
  mkdirSync(dirname(WORKER_BUILT_SHA_FILE), { recursive: true });
  writeFileSync(WORKER_BUILT_SHA_FILE, `${currentSha}\n`, 'utf8');

  // 4. Prune devDependencies and pnpm content-addressable store to keep disk < 200 MB
  if (process.env.BOTKEEP_SKIP_PRUNE !== '1') {
    try {
      run(
        'pnpm install --filter @kestrel/worker... --prod --frozen-lockfile --config.confirmModulesPurge=false',
      );
      run('pnpm store prune');
    } catch (err) {
      log('warn', 'Non-fatal prune warning', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const cacheDirs = [
      resolve(ROOT, '.pnpm-store'),
      resolve(ROOT, 'node_modules/.cache'),
      resolve(homedir(), '.local/share/pnpm/store'),
      resolve(homedir(), '.cache'),
    ];
    for (const dir of cacheDirs) {
      try {
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore permission errors on shared host dirs */
      }
    }
    log('info', 'Pruned build caches to stay well under Botkeep 2 GB storage limit');
  }
}

function startLightCronPoker() {
  if (process.env.WORKER_POKE_LIGHT_CRONS === '0') {
    log('info', 'Light cron poker disabled via WORKER_POKE_LIGHT_CRONS=0');
    return;
  }

  const baseUrl = process.env.PRODUCTION_URL;
  const cronSecret = process.env.CRON_SECRET;
  if (!baseUrl || !cronSecret) {
    log(
      'warn',
      'PRODUCTION_URL or CRON_SECRET not set; skipping Vercel /api/cron/* light cron pokes',
    );
    return;
  }

  const schedules = [
    { path: '/api/cron/warm-cache', intervalMs: 2 * 60_000 },
    { path: '/api/cron/news', intervalMs: 5 * 60_000 },
    { path: '/api/cron/alerts', intervalMs: 5 * 60_000 },
    { path: '/api/cron/health-alerts', intervalMs: 5 * 60_000 },
    { path: '/api/cron/calendar', intervalMs: 15 * 60_000 },
    { path: '/api/cron/billing-dlq', intervalMs: 60 * 60_000 },
    { path: '/api/cron/cleanup-uploads', intervalMs: 24 * 60 * 60_000 },
    { path: '/api/cron/cleanup-tokens', intervalMs: 24 * 60 * 60_000 },
    { path: '/api/cron/cleanup-telemetry', intervalMs: 24 * 60 * 60_000 },
  ];

  const inFlight = new Set();

  const poke = async (path) => {
    if (inFlight.has(path)) return;
    inFlight.add(path);
    const start = Date.now();
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          'User-Agent': 'kestrel-botkeep-light-cron/1.0',
        },
        signal: AbortSignal.timeout(30_000),
      });
      log(res.ok ? 'info' : 'warn', 'Light cron poke finished', {
        endpoint: path,
        status: res.status,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      log('warn', 'Light cron poke failed', {
        endpoint: path,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      inFlight.delete(path);
    }
  };

  log('info', 'Starting embedded Light Cron Poker for Vercel endpoints', {
    target: baseUrl,
    endpoints: schedules.map((s) => s.path),
  });

  // Stagger initial pokes 15s after worker startup
  setTimeout(() => {
    for (const item of schedules) {
      if (item.intervalMs <= 15 * 60_000) {
        void poke(item.path);
      }
      const timer = setInterval(() => {
        void poke(item.path);
      }, item.intervalMs);
      timer.unref();
    }
  }, 15_000).unref();
}

async function main() {
  loadDotEnvFiles();
  applySmartEnvDefaults();

  if (process.argv.includes('--check-only')) {
    log('info', 'Environment check complete (--check-only)', {
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      hasEncryptionSecret: Boolean(process.env.ENCRYPTION_SECRET),
      productionUrl: process.env.PRODUCTION_URL || null,
      workerMode: process.env.WORKER_MODE,
    });
    return;
  }

  maybeGitPull();
  ensureWorkerBuilt();
  startLightCronPoker();

  log('info', 'Booting @kestrel/worker daemon...', {
    entry: WORKER_DIST_ENTRY,
    workerMode: process.env.WORKER_MODE,
    sha: process.env.DEPLOYED_SHA,
  });

  await import(pathToFileURL(WORKER_DIST_ENTRY).href);
}

main().catch((err) => {
  log('error', 'Fatal error in botkeep-start launcher', {
    error: err instanceof Error ? err.stack || err.message : String(err),
  });
  process.exit(1);
});
