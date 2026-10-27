#!/usr/bin/env node
// @ts-check
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..');
const BUILD_ID_FILE = resolve(WEB_ROOT, '.build-id');
const ENV_FILE = resolve(WEB_ROOT, '.env.production.local');
const ENV_KEY = 'NEXT_PUBLIC_BUILD_ID';

export function resolveGitSha() {
  const fromEnv =
    process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.GIT_COMMIT_SHA;
  if (fromEnv && /^[0-9a-f]{7,}$/i.test(fromEnv)) {
    return fromEnv.slice(0, 7).toLowerCase();
  }
  try {
    const sha = execSync('git rev-parse --short=7 HEAD', {
      cwd: WEB_ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (/^[0-9a-f]{7,}$/i.test(sha)) return sha.slice(0, 7).toLowerCase();
  } catch {
    /* fall through */
  }
  return 'local00';
}

export function resolveDirtySuffix(cwd = WEB_ROOT) {
  try {
    const porcelain = execSync('git status --porcelain --untracked-files=normal', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (!porcelain) return '';
    return createHash('sha256').update(porcelain).digest('hex').slice(0, 8);
  } catch {
    return '';
  }
}

export function upsertEnvLine(path, key, value) {
  const line = `${key}=${value}`;
  if (!existsSync(path)) {
    writeFileSync(path, `${line}\n`, 'utf8');
    return true;
  }
  const current = readFileSync(path, 'utf8');
  const lines = current.split(/\r?\n/);
  const keyPattern = new RegExp(`^\\s*${key}\\s*=`);
  const idx = lines.findIndex((l) => keyPattern.test(l));
  let nextContent;
  if (idx === -1) {
    const sep = current.endsWith('\n') || current.length === 0 ? '' : '\n';
    nextContent = `${current}${sep}${line}\n`;
  } else {
    lines[idx] = line;
    nextContent = lines.join('\n');
  }
  if (nextContent === current) {
    return false;
  }
  writeFileSync(path, nextContent, 'utf8');
  return true;
}

export function resolveBuildId(opts = {}) {
  // Highest priority: an explicit operator/CI stamp (release pipeline, Docker
  // build arg). Container builds carry no git metadata, so without this every
  // image would share the `local00` fallback — and because `sw.js` is otherwise
  // byte-identical, the browser would never see a worker update and the shell
  // cache would pin the first release's assets forever.
  const explicit = opts.buildId ?? process.env.KESTREL_BUILD_ID;
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return explicit.trim();
  }
  const sha = opts.sha ?? resolveGitSha();
  const forceEpoch = opts.forceEpoch ?? process.env.KESTREL_FORCE_EPOCH_BUILD_ID === '1';
  if (forceEpoch) {
    return `${sha}-${Math.floor(Date.now() / 1000)}`;
  }
  const dirtyHash = opts.dirtyHash ?? resolveDirtySuffix();
  return dirtyHash ? `${sha}-${dirtyHash}` : sha;
}

export function main() {
  const buildId = resolveBuildId();
  if (!existsSync(BUILD_ID_FILE) || readFileSync(BUILD_ID_FILE, 'utf8').trim() !== buildId) {
    writeFileSync(BUILD_ID_FILE, `${buildId}\n`, 'utf8');
  }
  upsertEnvLine(ENV_FILE, ENV_KEY, buildId);
  upsertEnvLine(ENV_FILE, 'AUTH_MODE', 'normal');
  console.log(`[set-build-id] ${ENV_KEY}=${buildId}`);
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  main();
}
