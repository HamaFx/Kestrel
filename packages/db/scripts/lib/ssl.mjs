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

// Shared TLS resolution for the database maintenance scripts.
//
// Every script used to carry its own copy of the Supabase root CA and the
// production/local policy. They now all delegate to the standalone helper,
// which has no build dependency, so the CA and the fail-closed rules have
// exactly one owner before and after `pnpm build:packages`.

import { resolvePostgresSslOptions } from './ssl-standalone.mjs';

/**
 * @param {string | undefined} databaseUrl
 * @returns {false | { rejectUnauthorized: boolean, ca?: string }}
 */
export function resolveScriptSsl(databaseUrl) {
  return resolvePostgresSslOptions(databaseUrl ?? '', process.env);
}
