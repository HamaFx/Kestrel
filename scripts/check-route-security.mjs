#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const routes = execFileSync('git', ['ls-files', 'apps/web/src/app/api'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter((file) => file.endsWith('/route.ts'));

const intentionalRawBody = new Set([
  'apps/web/src/app/api/telegram/webhook/route.ts',
  'apps/web/src/app/api/billing/webhook/route.ts',
]);

const intentionalPublic = new Set([
  'apps/web/src/app/api/health/public/route.ts',
  'apps/web/src/app/api/auth/[...nextauth]/route.ts',
  'apps/web/src/app/api/auth/verify-email/route.ts',
  'apps/web/src/app/api/billing/webhook/route.ts',
  'apps/web/src/app/api/telegram/webhook/route.ts',
  'apps/web/src/app/api/market/stream/route.ts',
  'apps/web/src/app/api/dev/login/route.ts',
  'apps/web/src/app/api/cron/health-alerts/route.ts',
]);

const failures = [];
const bodyParserFailures = [];
for (const relative of routes) {
  const source = readFileSync(join(root, relative), 'utf8');
  if (
    !intentionalRawBody.has(relative) &&
    /(POST|PUT|PATCH)\s*=|export const (POST|PUT|PATCH)/.test(source) &&
    source.includes('req.json()')
  ) {
    bodyParserFailures.push(
      `${relative}: state-changing route must use parseJsonBody instead of req.json()`,
    );
  }
  const isAdmin = relative.includes('/admin/');
  const isCron = relative.includes('/cron/');
  const hasAuth = /(?:withAuth|compose)(?:<[^>]+>)?\s*\(/.test(source) || /withAuth/.test(source);
  const hasAdminAuth = /withAdminAuth(?:<[^>]+>)?\s*\(/.test(source);
  const hasCronAuth = /withCronAuth(?:<[^>]+>)?\s*\(/.test(source);
  const hasExplicitAdminWrapper = /withAdminAuth/.test(source);
  const hasExplicitCronWrapper = /withCronAuth/.test(source);
  const hasWebhookValidation =
    /verify(?:Hmac|Signature)|signature|WEBHOOK|IPN|Telegram/i.test(source) &&
    (relative.includes('/webhook/') || relative.includes('/webhook/route.ts'));

  if (intentionalPublic.has(relative)) continue;
  if (isAdmin && !hasExplicitAdminWrapper) {
    if (/from ['\"]@\/lib\/admin-auth['\"]/.test(source)) continue;
    failures.push(`${relative}: admin route must use withAdminAuth`);
    continue;
  }
  if (isCron && !hasExplicitCronWrapper) {
    if (/from ['\"]@\/lib\/cron['\"]/.test(source)) continue;
    failures.push(`${relative}: cron route must use withCronAuth`);
    continue;
  }
  if (relative.includes('/billing/webhook/') || relative.includes('/telegram/webhook/')) {
    if (!hasWebhookValidation)
      failures.push(`${relative}: webhook route lacks recognizable signature validation`);
    continue;
  }
  if (!hasAuth && !intentionalPublic.has(relative)) {
    // Static wrappers may be imported through aliases or composed helpers;
    // keep this check focused on routes with no recognizable boundary at all.
    const hasBoundaryImport = /from ['\"]@\/lib\/(?:api|admin-auth|cron)['\"]/.test(source);
    if (!hasBoundaryImport)
      failures.push(
        `${relative}: route is unclassified; use withAuth, compose, or add it to the intentional boundary allowlist`,
      );
  }
}

if (failures.length || bodyParserFailures.length) {
  console.error('Route security classification failed:');
  for (const failure of [...failures, ...bodyParserFailures]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Route security classification passed (${routes.length} routes reviewed).`);
