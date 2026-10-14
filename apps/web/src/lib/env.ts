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

// SPDX-License-Identifier: Apache-2.0

// Lazy, cached env access delegating to @kestrel/shared parseServerEnv.
//
// Development secrets are auto-generated when missing and cached in
// `.kestrel/dev-secrets.json` so encrypted BYOK payloads survive restarts.

import 'server-only';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseServerEnv, type ServerEnv } from '@kestrel/shared';
import {
  AUTO_GENERATED_SECRETS,
  generateSecret,
  SECRET_MIN_BYTES,
} from '@kestrel/shared/env-secrets';

export type AuthEnv = ServerEnv;

let _serverEnv: ServerEnv | null = null;

// -----------------------------------------------------------------------
// Dev secret persistence
// -----------------------------------------------------------------------

/**
 * Path where dev-mode generated secrets are persisted. Lives inside the
 * already-gitignored `.kestrel/` directory so it never reaches the repo.
 * Mode 0600 on creation so other local users cannot read the keys.
 */
const DEV_SECRETS_PATH = resolve('.kestrel/dev-secrets.json');

type DevSecretStore = Partial<Record<(typeof AUTO_GENERATED_SECRETS)[number], string>>;

function readDevSecrets(): DevSecretStore {
  try {
    if (!existsSync(DEV_SECRETS_PATH)) return {};
    const raw = readFileSync(DEV_SECRETS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as DevSecretStore;
  } catch {
    // Corrupted file — fall through to regeneration.
  }
  return {};
}

function writeDevSecrets(store: DevSecretStore): void {
  mkdirSync(resolve('.kestrel'), { recursive: true });
  writeFileSync(DEV_SECRETS_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
}

/**
 * Ensure every auto-generatable secret exists on `process.env`. In dev
 * mode (NODE_ENV !== 'production') we either reuse a previously
 * persisted value or generate a fresh one.
 */
export function loadOrGenerateDevSecrets(): {
  generated: boolean;
  store: DevSecretStore;
} {
  if (process.env.NODE_ENV === 'production') {
    return { generated: false, store: {} };
  }

  const store = readDevSecrets();
  let generated = false;

  for (const key of AUTO_GENERATED_SECRETS) {
    if (process.env[key]) continue;
    if (store[key]) {
      process.env[key] = store[key];
      continue;
    }
    const value = generateSecret(SECRET_MIN_BYTES[key]);
    process.env[key] = value;
    store[key] = value;
    generated = true;
  }

  if (generated) {
    try {
      writeDevSecrets(store);
      console.warn(
        `[env] Generated dev secrets persisted to ${DEV_SECRETS_PATH}. ` +
          'Set explicit AUTH_SECRET / ENCRYPTION_SECRET / CRON_SECRET before deploying.',
      );
    } catch (err) {
      console.warn(
        `[env] Generated dev secrets but failed to persist (${err instanceof Error ? err.message : String(err)}). ` +
          'BYOK-encrypted keys will be unreadable after the next restart.',
      );
    }
  }

  return { generated, store };
}

export function getAuthEnv(): AuthEnv {
  return getServerEnv();
}

export function getServerEnv(): ServerEnv {
  if (_serverEnv) return _serverEnv;
  loadOrGenerateDevSecrets();
  _serverEnv = parseServerEnv(process.env);
  return _serverEnv;
}

// Trigger validation immediately at startup (skip in test runner and build phase)
if (
  process.env.NODE_ENV !== 'test' &&
  !process.env.VITEST &&
  process.env.NEXT_PHASE !== 'phase-production-build'
) {
  getServerEnv();
}
