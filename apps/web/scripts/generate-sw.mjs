#!/usr/bin/env node
// @ts-check
/**
 * generate-sw.mjs
 *
 * Postbuild step. Stamps the service worker with the current build id and
 * writes the precache manifest consumed by the SW's `install` handler.
 *
 * Inputs (in order of preference):
 *   1. `process.env.NEXT_PUBLIC_BUILD_ID`
 *   2. `apps/web/.build-id` (written by `set-build-id.mjs`)
 *   3. `<epoch>` fallback (logged as a warning)
 *
 * Outputs (into `public/` unless `KESTREL_SW_OUT_DIR` overrides it):
 *   - `sw.js`              — `__BUILD_ID__` / `__ASSET_REV__` / VAPID substituted
 *   - `sw-precache.json`   — exact precache list
 *
 * `KESTREL_SW_OUT_DIR` exists for tests and packaging checks: they must be
 * able to exercise the generator without overwriting the served `public/sw.js`
 * (two test files racing on that write is how a stale worker gets shipped).
 *
 * The SW source template lives at `apps/web/scripts/sw.template.js`.
 *
 * Requirements: 5.5, 5.6, 5.7
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..');
export const TEMPLATE_FILE = resolve(WEB_ROOT, 'scripts/sw.template.js');
export const PUBLIC_DIR = resolve(WEB_ROOT, 'public');
export const BUILD_ID_FILE = resolve(WEB_ROOT, '.build-id');
/** Default served location; tests redirect this with `KESTREL_SW_OUT_DIR`. */
export const SW_OUT_FILE = resolve(PUBLIC_DIR, 'sw.js');
export const PRECACHE_OUT_FILE = resolve(PUBLIC_DIR, 'sw-precache.json');

/**
 * Precache list — exact URLs only, all public and non-personalised.
 *
 * `/offline` is the fallback every failed navigation resolves to. The icons,
 * favicon and manifest are what the OS reads while installing, so they should
 * already be on device when the app is opened offline for the first time.
 *
 * `/chat` is deliberately absent: it is an auth-gated document, and caching it
 * would leave one session's research surface readable on a shared device (the
 * navigation handler refuses to replay non-public HTML for the same reason).
 *
 * Entries are fetched individually at install time, so a single 404 degrades
 * that one entry instead of emptying the whole cache.
 */
export const PRECACHE_URLS = Object.freeze([
  '/offline',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/favicon.ico',
  '/manifest.webmanifest',
]);

/**
 * Resolve the build id from env → .build-id → epoch fallback.
 *
 * @returns {string}
 */
export function resolveBuildId() {
  const fromEnv = process.env.NEXT_PUBLIC_BUILD_ID;
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  if (existsSync(BUILD_ID_FILE)) {
    const fromFile = readFileSync(BUILD_ID_FILE, 'utf8').trim();
    if (fromFile.length > 0) return fromFile;
  }

  const epoch = String(Math.floor(Date.now() / 1000));
  // eslint-disable-next-line no-console
  console.warn(
    `[generate-sw] No NEXT_PUBLIC_BUILD_ID or .build-id found; falling back to epoch=${epoch}`,
  );
  return epoch;
}

/**
 * Short digest of the precache list, folded into the cache name.
 *
 * The build id can legitimately repeat (two deploys of the same commit, a
 * Docker build with no git metadata). If it does, the browser sees a
 * byte-identical worker and never re-activates — so the cache must also rotate
 * whenever the set of precached URLs changes.
 *
 * @returns {string}
 */
export function resolveAssetRev() {
  return createHash('sha256').update(JSON.stringify(PRECACHE_URLS)).digest('hex').slice(0, 8);
}

/** @returns {string} absolute output directory for the generated files. */
export function resolveOutDir() {
  const override = process.env.KESTREL_SW_OUT_DIR;
  return override ? resolve(override) : PUBLIC_DIR;
}

export function main() {
  if (!existsSync(TEMPLATE_FILE)) {
    // Fail before writing anything: a fresh manifest with no worker behind it
    // is worse than no update at all.
    // eslint-disable-next-line no-console
    console.error(
      `[generate-sw] template not found at ${TEMPLATE_FILE}. ` +
        `Service worker cannot be generated; failing the build.`,
    );
    process.exit(1);
  }

  const buildId = resolveBuildId();
  const assetRev = resolveAssetRev();
  const outDir = resolveOutDir();
  const swFile = resolve(outDir, 'sw.js');
  const precacheFile = resolve(outDir, 'sw-precache.json');

  const template = readFileSync(TEMPLATE_FILE, 'utf8');
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
  const stamped = template
    .replace(/__BUILD_ID__/g, buildId)
    .replace(/__ASSET_REV__/g, assetRev)
    .replace(/__VAPID_PUBLIC_KEY__/g, vapidPublicKey);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(swFile, stamped, 'utf8');
  writeFileSync(precacheFile, `${JSON.stringify(PRECACHE_URLS, null, 2)}\n`, 'utf8');

  console.log(
    `[generate-sw] wrote ${swFile} (build: ${buildId}, assets: ${assetRev}` +
      `${vapidPublicKey ? '' : ', no VAPID key — push re-subscribe disabled'})`,
  );
  console.log(`[generate-sw] wrote ${precacheFile} (${PRECACHE_URLS.length} urls)`);
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
