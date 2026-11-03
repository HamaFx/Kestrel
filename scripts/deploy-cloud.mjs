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
 * One-Command Cloud Deployment Config Generator (`node scripts/deploy-cloud.mjs`)
 *
 * Generates and synchronizes environment variables for the two supported
 * deployment profiles:
 *   1. Standalone worker on Compose or a small VM (`.env.worker`)
 *   2. Vercel web app (`/.env.vercel` pasted into Project Settings)
 *
 * Usage:
 *   node scripts/deploy-cloud.mjs --db="postgres://..." --url="https://hamafx-ai.vercel.app"
 */

import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseEnvFile(filePath) {
  const map = new Map();
  if (!existsSync(filePath)) return map;
  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (v) map.set(k, v);
  }
  return map;
}

function parseCliArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (arg.startsWith('--db=')) out.db = arg.slice('--db='.length);
    else if (arg.startsWith('--admin-db=')) out.adminDb = arg.slice('--admin-db='.length);
    else if (arg.startsWith('--url=')) out.url = arg.slice('--url='.length);
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

function writeSecureFile(filePath, content) {
  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(filePath, 0o600);
  } catch {
    /* ignore on Windows */
  }
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    // eslint-disable-next-line no-console
    console.log(
      [
        'Usage: node scripts/deploy-cloud.mjs [options]',
        '',
        'Options:',
        '  --db=<postgres-url>         Supabase/Postgres connection string',
        '  --admin-db=<postgres-url>   Direct/admin Postgres URL (defaults to --db)',
        '  --url=<https://...>         Production Vercel web URL (default: https://hamafx-ai.vercel.app)',
      ].join('\n'),
    );
    return;
  }

  const existing = new Map([
    ...parseEnvFile(resolve(ROOT, '.env')),
    ...parseEnvFile(resolve(ROOT, '.env.local')),
    ...parseEnvFile(resolve(ROOT, '.env.worker')),
  ]);

  const getOrGen = (key, bytes) => {
    const val = process.env[key] || existing.get(key);
    if (val && val.length >= bytes) return val;
    return randomBytes(bytes).toString('hex');
  };

  const encryptionSecret = (() => {
    const cur = process.env.ENCRYPTION_SECRET || existing.get('ENCRYPTION_SECRET') || '';
    return /^[0-9a-fA-F]{64}$/.test(cur) ? cur : randomBytes(32).toString('hex');
  })();

  const authSecret = getOrGen('AUTH_SECRET', 32);
  const cronSecret = getOrGen('CRON_SECRET', 24);
  const workerHealthToken = getOrGen('WORKER_HEALTH_TOKEN', 24);
  const biquoteProxyToken = getOrGen('BIQUOTE_PROXY_TOKEN', 24);
  // Audit 2026-10-31 (R1): the web app and worker connect as the non-bypass
  // `kestrel_app` role so row level security applies. This is only the
  // credential — the role and its grants come from migration 0119 plus a
  // one-off `pnpm --filter @kestrel/db provision:app-role`.
  const appDbPassword = getOrGen('POSTGRES_APP_PASSWORD', 32);

  /**
   * Rewrite a Postgres URL to connect as `kestrel_app`.
   *
   * The username suffix is preserved because Supabase's pooler routes on
   * `<role>.<project-ref>`: `postgres.abcdef` must become
   * `kestrel_app.abcdef`, not `kestrel_app`. Returns null when the URL is a
   * placeholder that cannot be parsed, so the caller can say so instead of
   * silently shipping a privileged connection.
   */
  function toAppDbUrl(privilegedUrl, password) {
    try {
      const parsed = new URL(privilegedUrl);
      const [, ...suffix] = parsed.username.split('.');
      parsed.username = ['kestrel_app', ...suffix].join('.');
      parsed.password = password;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  const dbUrl =
    args.db ||
    process.env.DATABASE_URL ||
    existing.get('DATABASE_URL') ||
    'postgres://postgres.<project-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

  const appDbUrl = toAppDbUrl(dbUrl, appDbPassword);
  const appDbUrlNote = appDbUrl
    ? `# App traffic connects as kestrel_app (non-bypass), so row level security applies.`
    : [
        '# WARNING: DATABASE_URL could not be rewritten to the kestrel_app role',
        '# (it is still a placeholder). Once the real URL is set, re-run this',
        '# script — until then the app would connect with a role that bypasses RLS.',
      ].join('\n');

  const adminDbUrl =
    args.adminDb ||
    process.env.ADMIN_DATABASE_URL ||
    existing.get('ADMIN_DATABASE_URL') ||
    existing.get('DIRECT_URL') ||
    dbUrl.replace(':6543/', ':5432/');

  const appUrl = (
    args.url ||
    process.env.PRODUCTION_URL ||
    existing.get('PRODUCTION_URL') ||
    existing.get('NEXT_PUBLIC_APP_URL') ||
    'https://hamafx-ai.vercel.app'
  ).replace(/\/+$/, '');

  const workerEnv = [
    '# ============================================================================',
    '# KESTREL — STANDALONE WORKER CONFIG (.env.worker)',
    '# Use with: docker run --env-file .env.worker kestrel-worker',
    '# DO NOT commit this file to Git.',
    '# ============================================================================',
    '',
    '# 1. Required Core Secrets (must match Vercel)',
    appDbUrlNote,
    `DATABASE_URL=${appDbUrl ?? dbUrl}`,
    `POSTGRES_APP_PASSWORD=${appDbPassword}`,
    `ADMIN_DATABASE_URL=${adminDbUrl}`,
    `DIRECT_URL=${adminDbUrl}`,
    `ENCRYPTION_SECRET=${encryptionSecret}`,
    `PRODUCTION_URL=${appUrl}`,
    `CRON_SECRET=${cronSecret}`,
    '',
    '# 2. Auto-Derived / Matched Security Tokens',
    `AUTH_SECRET=${authSecret}`,
    `WORKER_HEALTH_TOKEN=${workerHealthToken}`,
    `BIQUOTE_PROXY_TOKEN=${biquoteProxyToken}`,
    'WORKER_MODE=docker',
    'MULTI_USER_ENABLED=1',
    'KESTREL_ENABLE_RLS=1',
    'REGISTRATION_MODE=first_user',
    '',
  ].join('\n');

  const vercelEnv = [
    '# ============================================================================',
    '# KESTREL — VERCEL WEB APP ENVIRONMENT VARIABLES (.env.vercel)',
    '# Paste these into Vercel Project Settings -> Environment Variables',
    '# DO NOT commit this file to Git.',
    '# ============================================================================',
    '',
    appDbUrlNote,
    `DATABASE_URL=${appDbUrl ?? dbUrl}`,
    `POSTGRES_APP_PASSWORD=${appDbPassword}`,
    `ADMIN_DATABASE_URL=${adminDbUrl}`,
    `DIRECT_URL=${adminDbUrl}`,
    `ENCRYPTION_SECRET=${encryptionSecret}`,
    `AUTH_SECRET=${authSecret}`,
    `CRON_SECRET=${cronSecret}`,
    `NEXT_PUBLIC_APP_URL=${appUrl}`,
    `NEXTAUTH_URL=${appUrl}`,
    'MULTI_USER_ENABLED=1',
    'KESTREL_ENABLE_RLS=1',
    'REGISTRATION_MODE=first_user',
    '',
  ].join('\n');

  const workerPath = resolve(ROOT, '.env.worker');
  const vercelPath = resolve(ROOT, '.env.vercel');
  writeSecureFile(workerPath, workerEnv);
  writeSecureFile(vercelPath, vercelEnv);

  // eslint-disable-next-line no-console
  console.log(
    [
      '✅ Generated cloud deployment files:',
      `   • .env.worker  (standalone worker on Compose or a small VM)`,
      `   • .env.vercel  (matching secrets for Vercel Project Settings)`,
      '',
      '🚀 Vercel + Supabase:',
      '   1. Paste .env.vercel into Vercel Project Settings -> Environment Variables',
      '   2. Run the worker elsewhere:',
      '      docker build -f Dockerfile.worker -t kestrel-worker .',
      '      docker run -d --env-file .env.worker kestrel-worker',
    ].join('\n'),
  );
}

main();
