// SPDX-License-Identifier: Apache-2.0

// Audit 2026-10-31 (R5) — write-only BYOK inputs.
//
// The stored secret must never reach the browser: the settings page decrypts
// server-side only to learn *which* providers have a key (booleans), and a
// provider whose key is already stored prefills this sentinel instead of the
// plaintext. The save action treats the sentinel as "keep the stored value";
// an empty field clears the key. Same convention as the Jev decision-model
// card (`JEV_DECISION_KEY_KEEP`), which was already boolean-seeded.
//
// Dependency-free so both the client card and the server action can import it.

/**
 * Sentinel prefilled into an input whose key is already stored. The save
 * action treats it as "keep the stored value"; clearing the field removes
 * the key.
 */
export const BYOK_KEY_KEEP = '***KEEP***';
