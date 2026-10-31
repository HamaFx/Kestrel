// @vitest-environment node
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

// Audit 2026-10-31 (R1) — RSC tenant-scope contract.
//
// Why this guard exists. The hardened deployment connects as `kestrel_app`
// (NOBYPASSRLS). Under that role an unscoped read of an RLS-protected table
// does not raise: current_setting('app.current_tenant', true) is NULL, every
// tenant_isolation policy evaluates to false, and the query returns ZERO ROWS.
// A missing scope therefore renders as an empty account, not a failure. API
// routes are safe because withAuth opens a tenant transaction; server
// components are not, so every page/layout that touches tenant data must
// declare a scope (withUserTenant), or sit on the admin connection by design.
//
// What this test actually asserts, and its honest limits:
//   - It is a text-level contract, not a call-graph proof. "Declares a scope"
//     means withUserTenant appears in the file; it neither proves the scoped
//     call wraps every tenant read nor that the identifier is not a comment.
//     The EXEMPT map is a reviewed claim, not a runtime check.
//   - It only sees direct @kestrel/db access: a getDb() call, or a non-type
//     import of an export outside SCOPE_SAFE_EXPORTS. Tenant reads reached
//     through service modules (@/lib/services/**, @kestrel/ai/**) are
//     invisible here; e.g. (app)/chat/page.tsx calls the thread persistence
//     helpers (createThread/listThreads) without a scope and is NOT flagged.
//   - route.ts handlers are excluded on purpose: they run behind withAuth,
//     withAdminAuth or withCronAuth, and scripts/check-route-security.mjs owns
//     that boundary contract.
//
// Every allowlist entry below is a security decision: state the tables read
// and why they have no RLS (or why the file is excluded), and expect review.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const APP_DIR = resolve(root, 'apps/web/src/app');
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), 'utf8');

/**
 * Files the walk skips by design, listed as data so the decision is visible:
 *   - `route.ts` handlers run behind withAuth/withAdminAuth/withCronAuth, each
 *     of which opens the right database scope at the API boundary. Which
 *     wrapper a route must use is owned by scripts/check-route-security.mjs.
 *   - `'use client'` files cannot import the server database client; their
 *     server reads live in the server components that render them.
 */
const EXCLUDED_BY_DESIGN = {
  fileNames: new Set(['route.ts']),
  clientDirective: /^\s*['"]use client['"]/m,
} as const;

const RSC_ENTRY_NAMES = new Set([
  'page.tsx',
  'layout.tsx',
  'default.tsx',
  ...EXCLUDED_BY_DESIGN.fileNames,
]);

/**
 * `@kestrel/db` exports that are not themselves a tenant read: scope
 * primitives, tenant resolution over non-RLS membership tables, and the schema
 * objects. Anything else imported at runtime is treated as tenant data until a
 * reviewer says otherwise.
 */
const SCOPE_SAFE_EXPORTS = new Set([
  'schema',
  'withUserTenant',
  'withUserTenantRO',
  'withTenantDb',
  'withTenantDbFresh',
  'withTenantDbRO',
  'withAdminDb',
  'getAdminDb',
  'requireTenantIdForUser',
  'getTenantIdForUser',
]);

/**
 * Cross-tenant helpers that must run on the admin (BYPASSRLS) connection.
 * A per-user tenant scope makes them silently return nothing (the rows belong
 * to other tenants), so a covered file that mentions one must not look like it
 * scopes everything with withUserTenant. The helpers' own connection choice is
 * owned by packages/db; this test only pins the convention at the RSC edge.
 */
const ADMIN_CONNECTION_REQUIRED = [
  'getPlatformAdminSettings',
  'listAllUserSettings',
  'getToolStats',
];

/** Identifiers that count as a declared per-user scope in a covered file. */
const SCOPE_DECLARATION = /\bwithUserTenant(?:RO)?\b/;

type ExemptionKind = 'unscoped-non-rls' | 'tracked-gap';

interface ScopeExemption {
  kind: ExemptionKind;
  reason: string;
  /** Access names this entry permits without a scope; everything else is checked. */
  accesses: string[];
}

/**
 * Reviewed per-file exemptions. Add an entry only with the tables read and the
 * reason they are safe (no RLS policy) or tracked as a known gap.
 */
const EXEMPT: Record<string, ScopeExemption> = {
  'apps/web/src/app/(app)/settings/profile/page.tsx': {
    kind: 'unscoped-non-rls',
    reason:
      'Reads only the `user` table (schema.users.twoFactorEnabled) and `account` ' +
      '(schema.accounts.providerAccountId). Neither has RLS: migration 0038 lists ' +
      '`user` among the tables that intentionally get no policy, and migration 0039 ' +
      'disables RLS on `account` (NextAuth adapter table with no tenant_id). The ' +
      'unscoped getDb() is safe, so only the direct client is excused.',
    accesses: ['getDb'],
  },
  'apps/web/src/app/(app)/settings/symbols/page.tsx': {
    kind: 'unscoped-non-rls',
    reason:
      'The direct getDb() read targets `symbol_catalog` (global rows, ' +
      "tenant_id = '__system__', never RLS-protected). The user's watchlist goes " +
      'through getWatchlistWithCatalog wrapped in withUserTenant; only the direct ' +
      'reads are excused so the helper stays covered by the scope rule.',
    accesses: ['getDb'],
  },
  'apps/web/src/app/onboarding/page.tsx': {
    kind: 'tracked-gap',
    reason:
      'TRACKED GAP, not a clean bill of health: reads `user_settings` (RLS, migration ' +
      '0038) through an unscoped getDb() with only a user_id+tenant_id WHERE clause. ' +
      'Under kestrel_app the row is invisible, so a user who completed onboarding is ' +
      'sent through it again. The fix is to wrap the read in withUserTenant; this ' +
      'entry exists because the R1 audit task owns only the test file. Removing the ' +
      'gap must delete this entry — the assertion below fails if the file declares a ' +
      'scope and the entry is left behind.',
    accesses: ['getDb'],
  },
};

const DB_IMPORT = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]@kestrel\/db['"]/g;
const DB_NAMESPACE_IMPORT = /import\s+\*\s+as\s+\w+\s+from\s+['"]@kestrel\/db['"]/;

/** Direct @kestrel/db accesses in a file, ignoring type-only imports. */
function tenantAccesses(source: string): string[] {
  const accesses = new Set<string>();
  if (/\bgetDb\s*\(/.test(source)) accesses.add('getDb');
  if (/\bgetDbRO\s*\(/.test(source)) accesses.add('getDbRO');
  if (DB_NAMESPACE_IMPORT.test(source)) accesses.add('*');
  for (const match of source.matchAll(DB_IMPORT)) {
    if (match[1]) continue; // `import type { ... }` has no runtime access.
    for (const raw of match[2].split(',')) {
      const specifier = raw.trim();
      if (!specifier || specifier.startsWith('type ')) continue;
      const name = specifier.split(/\s+as\s+/)[0].trim();
      if (name && !SCOPE_SAFE_EXPORTS.has(name) && !ADMIN_CONNECTION_REQUIRED.includes(name)) {
        accesses.add(name);
      }
    }
  }
  return [...accesses];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.')) walk(full, out);
    } else out.push(full);
  }
  return out;
}

const appFiles = walk(APP_DIR)
  .map((file) => relative(root, file).split('\\').join('/'))
  .sort();
const entryFiles = appFiles.filter((file) => RSC_ENTRY_NAMES.has(file.split('/').pop()!));
const rscFiles = entryFiles.filter((file) => !file.endsWith('route.ts'));
const routeFiles = entryFiles.filter((file) => file.endsWith('route.ts'));
const serverFiles = rscFiles.filter((file) => !EXCLUDED_BY_DESIGN.clientDirective.test(read(file)));

describe('RSC tenant scope contract (audit 2026-10-31 R1)', () => {
  it('walks server-component entry files and leaves route handlers to the route gate', () => {
    expect(rscFiles.length).toBeGreaterThan(30);
    expect(routeFiles.length).toBeGreaterThan(30);
    expect(serverFiles.length).toBeGreaterThan(0);
  });

  it('requires a declared tenant scope for every direct @kestrel/db tenant read', () => {
    const violations: string[] = [];
    for (const file of serverFiles) {
      const source = read(file);
      if (SCOPE_DECLARATION.test(source)) continue; // declares a scope; see header.
      const excused = new Set(EXEMPT[file]?.accesses ?? []);
      const uncovered = tenantAccesses(source).filter((access) => !excused.has(access));
      if (uncovered.length > 0) {
        violations.push(
          `${file}: ${uncovered.join(', ')} — wrap the read in withUserTenant() or add a reviewed EXEMPT entry`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps every exemption explicit and live', () => {
    for (const [file, entry] of Object.entries(EXEMPT)) {
      expect(serverFiles, `${file} is no longer a covered server component`).toContain(file);
      expect(entry.reason.length, `${file} needs a real reason`).toBeGreaterThan(40);
      const source = read(file);
      for (const access of entry.accesses) {
        expect(source, `${file} no longer uses the exempted access ${access}`).toContain(access);
      }
      if (entry.kind === 'tracked-gap') {
        // Ratchet: fixing the file must delete this entry.
        expect(source, `${file} now declares a scope — remove its tracked-gap entry`).not.toMatch(
          SCOPE_DECLARATION,
        );
      }
    }
  });

  it('keeps cross-tenant helpers out of per-user scopes in covered files', () => {
    const offenders: string[] = [];
    for (const file of serverFiles) {
      const source = read(file);
      if (!SCOPE_DECLARATION.test(source)) continue;
      const helpers = ADMIN_CONNECTION_REQUIRED.filter((name) => source.includes(name));
      if (helpers.length > 0) offenders.push(`${file}: ${helpers.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });
});
