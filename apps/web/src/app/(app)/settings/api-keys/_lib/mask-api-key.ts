// SPDX-License-Identifier: Apache-2.0

// Masked BYOK key previews.
//
// The settings page decrypts a stored key server-side only to learn whether the
// provider is configured. The plaintext must never cross the RSC boundary, so
// the editable card receives a mask instead: a short prefix, four bullets, and
// the last four characters. The value is display-only — saving still requires
// typing a replacement key or using the explicit Remove action.

export interface ApiKeyPreview {
  configured: boolean;
  maskedPreview: string | null;
}

const BULLETS = '••••';

/**
 * Build the display-only preview for a stored secret.
 *
 * - empty / whitespace-only input → `{ configured: false, maskedPreview: null }`
 * - four characters or fewer → bullets only (any preview would reveal the key)
 * - otherwise → up to four leading characters, bullets, last four characters
 *
 * Never throws: a malformed decrypt result is handled by the caller passing
 * `null`.
 */
export function maskApiKeyPreview(rawKey: string | null | undefined): ApiKeyPreview {
  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (key.length === 0) return { configured: false, maskedPreview: null };
  if (key.length <= 4) return { configured: true, maskedPreview: BULLETS };

  const prefix = key.length > 8 ? key.slice(0, 4) : '';
  return { configured: true, maskedPreview: `${prefix}${BULLETS}${key.slice(-4)}` };
}

/**
 * Build the per-provider preview map from a decrypted BYOK payload.
 *
 * Payload values are untrusted at this point (a partial decrypt may contain
 * non-strings), so anything that is not a non-empty string is omitted.
 */
export function buildKeyPreviewMap(payload: object | null | undefined): Record<string, string> {
  const previews: Record<string, string> = {};
  if (!payload) return previews;
  for (const [providerId, value] of Object.entries(payload)) {
    if (typeof value !== 'string') continue;
    const { maskedPreview } = maskApiKeyPreview(value);
    if (maskedPreview) previews[providerId] = maskedPreview;
  }
  return previews;
}
