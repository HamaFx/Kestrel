#!/usr/bin/env node
/**
 * Static route-security classification gate.
 *
 * Every `/api/**` route file must resolve to a real authentication boundary:
 *
 *   - routes under `/api/admin/**` must import and call `withAdminAuth`
 *     from `@/lib/auth/admin-auth`;
 *   - routes under `/api/cron/**` must import and call `withCronAuth`
 *     from `@/lib/http/cron`;
 *   - every other route must import and call `withAuth`/`compose` (or a
 *     specific admin/cron wrapper), or, for routes that read no tenant data
 *     and must not open a scoped transaction, import and call
 *     `getUserFromRequest` from `@/lib/http/api` and answer a missing session
 *     with a 401.
 *
 * The wrapper must be a real named import binding that is called in code.
 * Aliased imports (`import { withAuth as guard }`) count; a *mention* of
 * `withAuth` in a comment does not, because comments are stripped before the
 * call check. That closes the gap the audit found: the previous check grepped
 * for the wrapper name anywhere in the file, so `// uses withAuth` passed.
 *
 * LIMITATION — this is a static, text-level check, not a proof. It does not
 * execute the module, follow re-exports or dynamic imports, inspect the
 * wrapper's implementation, or verify that every exported handler is the one
 * the wrapper wraps (a route could import and call a wrapper in dead code and
 * still export an unwrapped handler). The manual-auth branch only proves the
 * import, a call, and a 401-shaped response exist. Treat it as a tripwire for
 * the failure mode that shipped once — a route with no recognizable boundary
 * at all — not as a substitute for review or for the runtime isolation tests.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const routes = execFileSync('git', ['ls-files', 'apps/web/src/app/api'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  // Deleted-but-unstaged files still appear in `git ls-files`; the gate runs
  // against the working tree, so ignore paths that are no longer there.
  .filter((file) => file.endsWith('/route.ts') && existsSync(join(root, file)));

const intentionalRawBody = new Set([]);

const intentionalPublic = new Set([
  'apps/web/src/app/api/health/public/route.ts',
  'apps/web/src/app/api/auth/[...nextauth]/route.ts',
  'apps/web/src/app/api/auth/verify-email/route.ts',
  'apps/web/src/app/api/market/stream/route.ts',
  'apps/web/src/app/api/dev/login/route.ts',
  'apps/web/src/app/api/cron/health-alerts/route.ts',
  // Generic public plugin transport. Each handler authenticates its provider
  // (HMAC path token + provider secret) before resolving an install.
  'apps/web/src/app/api/plugins/public/[pluginId]/[[...path]]/route.ts',
]);

// Named bindings that authenticate a request, by the module they come from.
const ADMIN_BOUNDARY = { modules: ['@/lib/auth/admin-auth'], wrappers: ['withAdminAuth'] };
const CRON_BOUNDARY = { modules: ['@/lib/http/cron'], wrappers: ['withCronAuth'] };
const USER_BOUNDARY = { modules: ['@/lib/http/api'], wrappers: ['withAuth', 'compose'] };
const MANUAL_AUTH = { modules: ['@/lib/http/api'], wrappers: ['getUserFromRequest'] };

/**
 * Map each locally bound name to the module(s) it was imported from. Handles
 * `import { withAuth as guard } from '...'`, multi-line imports and type-only
 * imports (which are harmless here: a type import of a wrapper cannot be
 * called, so the call check below still fails it).
 */
function namedImportBindings(source) {
  const bindings = new Map();
  const importRe = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRe.exec(source)) !== null) {
    const moduleName = match[2];
    for (const specifier of match[1].split(',')) {
      const text = specifier.trim();
      if (!text) continue;
      const asIndex = text.search(/\s+as\s+/);
      const imported = asIndex === -1 ? text : text.slice(0, asIndex).trim();
      const local =
        asIndex === -1
          ? imported
          : text
              .slice(asIndex)
              .replace(/\s+as\s+/, '')
              .trim();
      if (!imported || !local) continue;
      const refs = bindings.get(local) ?? [];
      refs.push({ imported, module: moduleName });
      bindings.set(local, refs);
    }
  }
  return bindings;
}

/**
 * Remove comments so a documented wrapper name cannot satisfy the checks.
 * Strings are left alone deliberately: a string mention of a wrapper is not a
 * call either, and string-aware stripping needs a parser.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

/** True when `local` is used in a call (including generic calls) in `code`. */
function isCalled(code, local) {
  const escaped = local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\w$.])${escaped}\\s*(?:\\(|<)`).test(code);
}

/** The local binding name for the first accepted wrapper import, or null. */
function findBoundaryBinding(bindings, boundaries) {
  for (const [local, refs] of bindings) {
    if (
      refs.some(
        (ref) =>
          boundaries.modules.includes(ref.module) && boundaries.wrappers.includes(ref.imported),
      )
    ) {
      return local;
    }
  }
  return null;
}

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

  if (intentionalPublic.has(relative)) continue;

  const code = stripComments(source);
  const bindings = namedImportBindings(source);
  const isAdmin = relative.includes('/admin/');
  const isCron = relative.includes('/cron/');

  if (isAdmin) {
    const binding = findBoundaryBinding(bindings, ADMIN_BOUNDARY);
    if (!binding) {
      failures.push(
        `${relative}: admin route must import withAdminAuth from @/lib/auth/admin-auth`,
      );
    } else if (!isCalled(code, binding)) {
      failures.push(`${relative}: withAdminAuth is imported but never called`);
    }
    continue;
  }

  if (isCron) {
    const binding = findBoundaryBinding(bindings, CRON_BOUNDARY);
    if (!binding) {
      failures.push(`${relative}: cron route must import withCronAuth from @/lib/http/cron`);
    } else if (!isCalled(code, binding)) {
      failures.push(`${relative}: withCronAuth is imported but never called`);
    }
    continue;
  }

  const wrapper =
    findBoundaryBinding(bindings, USER_BOUNDARY) ??
    findBoundaryBinding(bindings, ADMIN_BOUNDARY) ??
    findBoundaryBinding(bindings, CRON_BOUNDARY);
  if (wrapper) {
    if (!isCalled(code, wrapper)) {
      failures.push(
        `${relative}: route imports ${wrapper} but never calls it; use it or add the route to the intentional boundary allowlist`,
      );
    }
    continue;
  }

  const manual = findBoundaryBinding(bindings, MANUAL_AUTH);
  if (!manual) {
    failures.push(
      `${relative}: route is unclassified; use withAuth, compose, a cron/admin wrapper, or add it to the intentional boundary allowlist`,
    );
  } else if (!isCalled(code, manual)) {
    failures.push(`${relative}: getUserFromRequest is imported but never called`);
  } else if (!/unauthorizedResponse\s*\(|\b401\b/.test(code)) {
    failures.push(
      `${relative}: manual getUserFromRequest auth must reject a missing session with a 401`,
    );
  }
}

if (failures.length || bodyParserFailures.length) {
  console.error('Route security classification failed:');
  for (const failure of [...failures, ...bodyParserFailures]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Route security classification passed (${routes.length} routes reviewed).`);
