#!/usr/bin/env node

/**
 * Read-only Git-history secret scan.
 *
 * This scanner never rewrites history and never prints matching content.
 * It reports only strong credential indicators from executable/config files;
 * intentional fixtures and documentation are excluded to reduce noise.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const patterns = [
  {
    name: 'private key',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\\s\\S]{40,}/i,
  },
  { name: 'OpenAI-like key', regex: /\b(?:sk|rk)-[A-Za-z0-9_-]{32,}\b/ },
  { name: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{32,}\b/ },
  {
    name: 'credential-bearing database URL',
    regex:
      /\b(?:postgres|postgresql):\/\/(?!hamafx:\$\{POSTGRES_PASSWORD\}@|hamafx:\$\{POSTGRES_PASSWORD:-[^}]*\}@)[^\s/:]+:[^\s@]{12,}@/i,
  },
];
const ignoredPathPattern =
  /^(?:docs\/|\.agents\/|\.hermes\/|\.kiro\/|plans\/|.*(?:^|\/)(?:test|tests|__tests__|playwright-report|test-results)(?:\/|$)|.*\.(?:md|html|lock|snap))/;
const isIgnoredPath = (path) =>
  ignoredPathPattern.test(path) ||
  path === 'apps/web/src/app/(app)/settings/api-keys/_components/api-key-card.tsx';

// Localhost-only CI test credentials that are not real secrets. These power
// ephemeral services spun up and torn down inside CI runners (e.g. the
// PostgreSQL RLS test container) and are never used against production.
const testCredentialAllowlist = [/kestrel-ci-password(?:@|:\$|\b)/i];
const isAllowlistedCredential = (line) => testCredentialAllowlist.some((re) => re.test(line));

function run(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

let log;
try {
  log = run(['log', '--all', '--full-history', '--format=%H', '-p', '--text']);
} catch (error) {
  console.error(
    `Git-history scan could not run: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(2);
}

const findings = [];
for (const commit of log.split(/^commit /m)) {
  const hash = /^([0-9a-f]{40})/i.exec(commit)?.[1] ?? 'unknown';
  const lines = commit.split(/\r?\n/);
  let path = 'unknown';
  for (const line of lines) {
    const diffPath = /^\+\+\+ b\/(.+)$/.exec(line)?.[1];
    if (diffPath) path = diffPath;
    if (!line.startsWith('+') || line.startsWith('+++') || isIgnoredPath(path)) continue;
    if (isAllowlistedCredential(line)) continue;
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        findings.push({ hash: hash.slice(0, 12), path, type: pattern.name });
        break;
      }
    }
  }
}

if (findings.length) {
  console.error(`Git-history secret scan found ${findings.length} possible finding(s):`);
  for (const finding of findings)
    console.error(`- ${finding.hash} ${finding.path}: ${finding.type}`);
  console.error('Review and rotate credentials manually; this command does not rewrite history.');
  process.exit(1);
}

console.log('Git-history secret scan passed; no configured secret patterns found.');
