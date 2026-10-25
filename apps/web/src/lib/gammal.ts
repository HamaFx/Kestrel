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

// Gammal Tech payment-link + signed-token helpers.
//
// Gammal has no API keys. Checkout is a plain HTTPS link, and the only
// trustworthy server-side artefact is the short-lived RS256 `payment_token`.
// Verify it locally so Kestrel does not depend on the stateful verify
// endpoint's "status 1 is issued once" behaviour.

import 'server-only';

import { createVerify } from 'node:crypto';

import { z } from 'zod';

import { getServerEnv } from '@/lib/env';

export const GAMMAL_REFUND_EVENTS = [
  'payment.refunded',
  'payment.disputed',
  'payment.dispute_reversed',
  'payment.refund_failed',
] as const;

export type GammalRefundEvent = (typeof GAMMAL_REFUND_EVENTS)[number];

export interface GammalClaims {
  type: 'payment' | 'refund';
  txn: string;
  amount: number;
  currency: string;
  description: string;
  project_id: number;
  exp: number;
  event?: GammalRefundEvent;
  sale_txn?: string;
  refunded?: number;
  ratio?: number;
  full?: boolean;
  reason?: string;
}

const GammalClaimsSchema = z
  .object({
    type: z.enum(['payment', 'refund']),
    txn: z.string().min(1).max(200),
    amount: z.coerce.number().positive(),
    currency: z.string().length(3),
    description: z.string().max(200).optional().default(''),
    project_id: z.coerce.number().int().positive(),
    exp: z.coerce.number().int().positive(),
    event: z.enum(GAMMAL_REFUND_EVENTS).optional(),
    sale_txn: z.string().min(1).max(200).optional(),
    refunded: z.coerce.number().nonnegative().optional(),
    ratio: z.coerce.number().min(0).max(1).optional(),
    full: z.boolean().optional(),
    reason: z.string().max(500).optional(),
  })
  .passthrough();

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

let publicKeyCache: { pem: string; fetchedAt: number } | null = null;
const PUBLIC_KEY_TTL_MS = 24 * 60 * 60 * 1000;

export function isGammalEnabled(): boolean {
  const env = getServerEnv();
  return env.BILLING_ENABLED && env.BILLING_GAMMAL_ENABLED;
}

export function getGammalProjectId(): number {
  const id = getServerEnv().GAMMAL_PROJECT_ID;
  if (!id) throw new Error('GAMMAL_PROJECT_ID is not configured');
  return id;
}

/** Pass length for a Kestrel plan interval. */
export function passDaysForPlanInterval(interval: string, fallback = 30): number {
  switch (interval) {
    case 'monthly':
      return 30;
    case 'quarterly':
      return 90;
    case 'yearly':
      return 365;
    default:
      return fallback;
  }
}

/** Extract the local payment UUID embedded in Gammal's `desc` field. */
export function extractGammalOrderRef(description: string | null | undefined): string | null {
  if (!description) return null;
  return description.match(UUID_RE)?.[0] ?? null;
}

export function buildGammalPaymentLink(input: {
  projectId: number;
  amountCents: number;
  currency: string;
  description: string;
  callbackUrl: string;
}): string {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('Gammal amount must be a positive integer in cents');
  }
  const env = getServerEnv();
  const base = env.GAMMAL_API_BASE.replace(/\/+$/, '');
  const url = new URL(`${base}/sdk/pay/link/`);
  url.searchParams.set('pid', String(input.projectId));
  url.searchParams.set('amount', (input.amountCents / 100).toFixed(2));
  url.searchParams.set('desc', input.description.slice(0, 200));
  url.searchParams.set('currency', input.currency.toUpperCase());
  url.searchParams.set('callback', input.callbackUrl);
  return url.toString();
}

/** Fetch/cache the RS256 public key, or use the pinned PEM from env. */
export async function getGammalPublicKey(): Promise<string> {
  const env = getServerEnv();
  if (env.GAMMAL_PUBLIC_KEY_PEM) {
    const pinned = env.GAMMAL_PUBLIC_KEY_PEM.replace(/\\n/g, '\n').trim();
    if (pinned.includes('BEGIN PUBLIC KEY')) return pinned;
    // Allow a single-line base64 env value for platforms that strip newlines.
    const decoded = Buffer.from(pinned, 'base64').toString('utf8').trim();
    if (decoded.includes('BEGIN PUBLIC KEY')) return decoded;
    throw new Error('GAMMAL_PUBLIC_KEY_PEM is not a PEM or base64-encoded PEM');
  }

  const now = Date.now();
  if (publicKeyCache && now - publicKeyCache.fetchedAt < PUBLIC_KEY_TTL_MS) {
    return publicKeyCache.pem;
  }

  const base = env.GAMMAL_API_BASE.replace(/\/+$/, '');
  const res = await fetch(`${base}/token/public-key.php`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Gammal public key fetch failed (${res.status})`);
  const pem = (await res.text()).trim();
  if (!pem.includes('BEGIN PUBLIC KEY')) {
    throw new Error('Gammal public key response was not a PEM public key');
  }
  publicKeyCache = { pem, fetchedAt: now };
  return pem;
}

function decodeJwtSegment(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Malformed Gammal token segment');
  }
}

/**
 * Verify a Gammal `payment_token` locally.
 *
 * The token is a short-lived RS256 JWT. We verify the signature with the
 * Gammal public key, then enforce expiry/project/type/shape. Callers must
 * still compare `project_id`, `amount` and `currency` to the local order.
 */
export async function verifyGammalToken(
  token: string,
  opts: { publicKeyPem?: string; now?: Date } = {},
): Promise<GammalClaims> {
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    throw new Error('Invalid Gammal payment token');
  }
  const [headerSegment, payloadSegment, signatureSegment] = token.split('.');
  if (!headerSegment || !payloadSegment || !signatureSegment) {
    throw new Error('Invalid Gammal payment token');
  }

  const header = decodeJwtSegment(headerSegment) as { alg?: unknown; typ?: unknown };
  if (header.alg !== 'RS256') throw new Error('Unsupported Gammal token algorithm');

  const pem = opts.publicKeyPem ?? (await getGammalPublicKey());
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerSegment}.${payloadSegment}`);
  verifier.end();
  const signature = Buffer.from(signatureSegment, 'base64url');
  if (!verifier.verify(pem, signature)) {
    throw new Error('Invalid Gammal token signature');
  }

  const parsed = GammalClaimsSchema.safeParse(decodeJwtSegment(payloadSegment));
  if (!parsed.success) {
    throw new Error('Malformed Gammal token claims');
  }
  const claims = parsed.data as GammalClaims;
  const nowSeconds = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  // Allow a small clock skew, but never accept an already-expired token.
  if (claims.exp + 60 < nowSeconds) {
    throw new Error('Gammal token has expired');
  }
  if (claims.type === 'refund') {
    if (!claims.event) throw new Error('Gammal refund token is missing its event');
    if (!claims.sale_txn) throw new Error('Gammal refund token is missing sale_txn');
  }
  return claims;
}

/** Convert a Gammal amount to integer cents for a 2-decimal currency. */
export function gammalAmountToCents(amount: number): number {
  return Math.round(amount * 100);
}
