import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const failures = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (['node_modules', '.git', '.next', 'dist', 'coverage', '.turbo'].includes(entry)) continue;
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else yieldFile(path);
  }
}

const files = [];
function yieldFile(path) {
  const relative = path.slice(root.length + 1);
  const isExample = relative === '.env.example';
  const isEnvFile = /(^|\/)\.env(?:$|\.)/.test(relative) && !isExample;
  const isWorkspaceEnv =
    isEnvFile && relative !== '.env' && !relative.endsWith('.local') && !relative.includes('.vercel') && !relative.includes('.bak') && !relative.includes('.tmp') && !relative.includes('.test');
  const isIgnoredLocalConfig = relative.startsWith('.vercel/') || relative.includes('/.vercel/');
  if (!isIgnoredLocalConfig && (isWorkspaceEnv || /\.(pem|key|p12|pfx)$/.test(path))) {
    failures.push(`forbidden environment/key file in release tree: ${path}`);
  }
  files.push(path);
}
walk(root);

for (const path of files) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  if (path.includes('/.github/workflows/')) {
    for (const [index, line] of text.split('\n').entries()) {
      if (/^\s*uses:\s*[^\s@]+@(master|main)\s*$/.test(line)) {
        failures.push(`${path}:${index + 1}: mutable GitHub Action reference`);
      }
    }
  }
  if (/REPLACE_WITH_VERIFIED|sha256:[A-Za-z0-9]+/.test(text) && /Dockerfile|docker-compose/.test(path)) {
    if (/REPLACE_WITH_VERIFIED/.test(text)) failures.push(`${path}: placeholder image digest`);
  }
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
