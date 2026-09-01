/** Copyright 2026 Kestrel
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

/**
 * Result type historically returned by older next-auth signIn calls.
 * Kept for callers that still receive the `{ ok, error }` shape.
 */
export interface SignInResult {
  ok: boolean;
  error?: string | null;
}

/**
 * Detect a failed `signIn` call.
 *
 * next-auth >= 5.0.0-beta.32 changes the server-action contract: calling
 * `signIn(..., { redirect: false })` returns the redirect URL as a string on
 * success and *throws* an `AuthError` on failure (received by the caller's
 * catch block). It never returns `{ ok: true }`, so treating a missing `ok`
 * as failure misreads every successful login. A string result therefore means
 * success; only a usable object-shaped result with `ok !== true` is a failure.
 */
export function isFailedSignIn(result: SignInResult | string): boolean {
  if (typeof result === 'string') return false;
  return result.ok !== true;
}
