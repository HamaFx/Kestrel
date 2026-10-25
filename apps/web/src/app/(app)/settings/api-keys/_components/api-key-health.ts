// SPDX-License-Identifier: Apache-2.0

// Health snapshot shared by the API-key card, its badges, and the health panel.

export interface ApiKeyHealth {
  ok: boolean;
  error: string | null;
  testedAt: string;
  rateLimit?: {
    remainingRequests?: number;
    remainingTokens?: number;
    resetRequests?: string;
    resetTokens?: string;
  } | null;
}
