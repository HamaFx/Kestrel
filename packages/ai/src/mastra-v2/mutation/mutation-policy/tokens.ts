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

// ---------------------------------------------------------------------------
// Phase 7 — stateful confirmation tokens (DEC-05 split of
// mutation-policy.ts).
//
// The workflow issues a single-use, expiring confirmation token at the draft
// step and stores only its HMAC in the persisted run state. The resume step
// verifies the presented token against the stored digest (timing-safe) and
// its expiry before any write executes. Single-use is enforced by the
// workflow run itself: a resumed run leaves the suspended state, so the same
// run cannot be resumed twice with the same token.
// ---------------------------------------------------------------------------

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { MastraMutationName } from './names';

export const MUTATION_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes default

/** Raw token handed to the client (random, high-entropy). */
export interface MutationConfirmationToken {
  token: string;
  expiresAt: number;
}

/** What the workflow persists in run state — never the raw token. */
export interface StoredMutationConfirmation {
  digest: string;
  expiresAt: number;
  /** Digest of the exact mutation input bound into the HMAC proof. */
  inputDigest: string;
}

export interface IssueConfirmationTokenOptions {
  mutation: MastraMutationName;
  userId: string;
  /** HMAC secret. Defaults to `AUTH_COOKIE_SECRET` from env. */
  secret?: string;
  ttlMs?: number;
  now?: number;
}

export function issueMutationConfirmationToken(
  options: IssueConfirmationTokenOptions,
): MutationConfirmationToken {
  // Ensures the secret is configured (throws in production when absent).
  confirmationSecret(options.secret);
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? MUTATION_TOKEN_TTL_MS;
  const token = randomBytes(32).toString('base64url');
  return { token, expiresAt: now + ttlMs };
}

/** Compute the persisted digest for a token (store this, not the token). */
export function storedConfirmationForToken(
  token: string,
  options: Omit<IssueConfirmationTokenOptions, 'ttlMs' | 'now'> & {
    expiresAt: number;
    inputDigest?: string;
  },
): StoredMutationConfirmation {
  const secret = confirmationSecret(options.secret);
  const inputDigest = options.inputDigest ?? '';
  return {
    digest: hmacDigest(
      secret,
      `${token}:${options.mutation}:${options.userId}:${inputDigest}:${options.expiresAt}`,
    ),
    expiresAt: options.expiresAt,
    inputDigest,
  };
}

export interface VerifyConfirmationTokenOptions {
  /** Raw token presented by the client on resume. */
  token: string;
  /** Digest + expiry persisted in run state by the draft step. */
  stored: StoredMutationConfirmation;
  mutation: MastraMutationName;
  userId: string;
  inputDigest?: string;
  /** Trusted server-side secret override; omitted callers use AUTH_COOKIE_SECRET. */
  secret?: string | undefined;
  now?: number;
}

/**
 * Timing-safe verification of a presented confirmation token against the
 * stored digest + expiry. Returns false for any mismatch (never throws), so
 * the resume step fails closed on replay, expiry, or cross-run token reuse.
 */
export function verifyMutationConfirmationToken(options: VerifyConfirmationTokenOptions): boolean {
  const secret = confirmationSecret(options.secret);
  const now = options.now ?? Date.now();
  if (now > options.stored.expiresAt) return false;
  const expected = hmacDigest(
    secret,
    `${options.token}:${options.mutation}:${options.userId}:${options.inputDigest ?? ''}:${options.stored.expiresAt}`,
  );
  return timingSafeEqualHex(expected, options.stored.digest);
}

export function confirmationSecret(explicit?: string): string {
  const secret = explicit ?? process.env.AUTH_COOKIE_SECRET ?? '';
  if (secret.length < 32) {
    // Fail closed: without a strong secret, confirmation tokens cannot be
    // issued. (Dev/test callers may pass an explicit secret.)
    if (process.env.NODE_ENV !== 'production' && explicit) return explicit;
    throw new Error(
      'AUTH_COOKIE_SECRET (>= 32 chars) is required for mutation confirmation tokens.',
    );
  }
  return secret;
}

function hmacDigest(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

/** Constant-time hex comparison (both sides hex-decoded). */
function timingSafeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
