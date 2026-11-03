// SPDX-License-Identifier: Apache-2.0

// Write-only BYOK inputs.
//
// The stored secret must never reach the browser: the settings page decrypts
// server-side only to learn *which* providers have a key and to build a masked
// preview. An untouched field is submitted empty and means "keep the stored
// value"; deleting one is an explicit action that submits the REMOVE sentinel.
//
// Dependency-free so both the client card and the server action can import it.

/**
 * Legacy prefill value from the R5 implementation. Accepted by the save action
 * so an open tab from before the Phase 1 change cannot overwrite a stored key
 * with the literal sentinel. New clients never send it.
 */
export const BYOK_KEY_KEEP = '***KEEP***';

/**
 * Explicit delete signal submitted by the "Remove key" action. The save action
 * deletes the provider's stored key instead of writing a credential.
 */
export const BYOK_KEY_REMOVE = '***REMOVE***';
