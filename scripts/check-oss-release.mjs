import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const failures = [];
const TEMPLATE_KEY_PATTERN = /^\s*([A-Z][A-Z0-9_]*)\s*=/gm;
const SECRET_LIKE_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i,
  /(?:sk|rk|pk)-[A-Za-z0-9_-]{20,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /private_key\s*[:=]\s*["']-----BEGIN PRIVATE KEY-----/i,
];
const IGNORED_SCAN_PATHS = [
  /^docs(?:\/|$)/,
  /^\.agents(?:\/|$)/,
  /^\.vercel(?:\/|$)/,
  /(?:^|\/)(?:\.next|dist|coverage|\.turbo|playwright-report|test-results|blob-report|artifacts)(?:\/|$)/,
  /\.tsbuildinfo$/,
  /^pnpm-lock\.yaml$/,
];
const CANONICAL_ENV_FILES = ['packages/shared/src/env.ts', 'apps/worker/src/env.ts'];
const ENV_REFERENCE_PATTERN = /process\.env(?:\[['"]([A-Z][A-Z0-9_]*)['"]\]|\.([A-Z][A-Z0-9_]*))/g;
const IGNORED_ENV_KEYS = new Set([
  'NODE_ENV', 'PATH', 'HOME', 'HOSTNAME', 'CI', 'VERCEL', 'VERCEL_ENV', 'NEXT_PHASE',
  'NEXT_RUNTIME', 'PORT', 'ANALYZE', 'VITEST', 'DEBUG', 'FORCE_COLOR', 'NO_COLOR',
]);

function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

const referencedEnvVars = new Set();
for (const relative of CANONICAL_ENV_FILES) {
  try {
    const text = readFileSync(join(root, relative), 'utf8');
    for (const match of text.matchAll(ENV_REFERENCE_PATTERN)) {
      const key = match[1] || match[2];
      if (key && !IGNORED_ENV_KEYS.has(key)) referencedEnvVars.add(key);
    }
  } catch (error) {
    failures.push(`unable to read canonical environment schema ${relative}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const relative of trackedFiles()) {
  if (IGNORED_SCAN_PATHS.some((pattern) => pattern.test(relative))) continue;
  const path = join(root, relative);
  const isExample = relative === '.env.example';
  const isEnvFile = /(^|\/)\.env(?:$|\.)/.test(relative) && !isExample;
  if (isEnvFile || /\.(pem|key|p12|pfx)$/.test(relative)) {
    failures.push(`forbidden environment/key file in tracked release tree: ${relative}`);
    continue;
  }
  if (isExample || relative.includes('/test/') || relative.startsWith('test/')) continue;
  if (relative === 'scripts/check-oss-release.mjs') continue;
  if (relative === 'apps/web/src/app/(app)/settings/api-keys/_components/api-key-card.tsx') continue;
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  if (/\.md$/i.test(relative) || /(?:Dockerfile|docker-compose)/i.test(relative) || /\.sql$/i.test(relative)) continue;
  for (const pattern of SECRET_LIKE_PATTERNS) {
    if (pattern.test(text)) {
      failures.push(`${relative}: secret-like content detected; use a placeholder or redact it`);
      break;
    }
  }
}

const examplePath = join(root, '.env.example');
try {
  const example = readFileSync(examplePath, 'utf8');
  const templateKeys = new Set([...example.matchAll(TEMPLATE_KEY_PATTERN)].map((match) => match[1]));
  const missingTemplateKeys = [...referencedEnvVars].filter((key) => !templateKeys.has(key)).sort();
  if (missingTemplateKeys.length) {
    failures.push(`.env.example is missing canonical environment variables: ${missingTemplateKeys.join(', ')}`);
  }
} catch (error) {
  failures.push(`unable to read .env.example: ${error instanceof Error ? error.message : String(error)}`);
}

if (process.env.NODE_ENV === 'production' && process.env.AUTH_MODE === 'legacy') {
  failures.push('AUTH_MODE=legacy is forbidden for production release checks');
}

if (failures.length) {
  console.error('OSS release check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('OSS release check passed.');
