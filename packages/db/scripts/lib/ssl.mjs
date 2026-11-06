// Shared TLS resolution for the database maintenance scripts.
//
// Every script used to carry its own copy of the Supabase root CA and the
// production/local policy. They now all delegate to the compiled runtime
// helper, so the CA and the fail-closed rules have exactly one owner.
//
// The scripts already require `dist/` (they import migration-plan.js), so
// importing the compiled helper adds no new build prerequisite.

import { resolvePostgresSslOptions } from '../../dist/connection/supabase-ca.js';

/**
 * @param {string | undefined} databaseUrl
 * @returns {false | { rejectUnauthorized: boolean, ca?: string }}
 */
export function resolveScriptSsl(databaseUrl) {
  return resolvePostgresSslOptions(databaseUrl ?? '', process.env);
}
