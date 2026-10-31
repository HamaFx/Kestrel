// SPDX-License-Identifier: Apache-2.0

// Decision 4A — shared constants for the Jev decision-model key card and its
// save action. Dependency-free so both the client card and the server action
// can import it.

import type { JevByokProviderId } from '@kestrel/shared';

/**
 * Sentinel prefilled into an input whose key is already stored. The save
 * action treats it as "keep the stored value"; clearing the field removes
 * the key.
 */
export const JEV_DECISION_KEY_KEEP = '***KEEP***';

export interface JevDecisionKeyMeta {
  id: JevByokProviderId;
  label: string;
  description: string;
}

/** The Jev System One providers surfaced in Settings → API Keys. */
export const JEV_DECISION_KEYS: readonly JevDecisionKeyMeta[] = [
  {
    id: 'opencode',
    label: 'OpenCode Console (jev-1.13-free)',
    description:
      'Free System One endpoint ($0.00 in / $0.00 out) at opencode.ai — powers 1-pass turn routing, packet calibration, and tool pruning.',
  },
  {
    id: 'liquid',
    label: 'Liquid AI (d1-ultra / d1.1)',
    description:
      'Tiered decision models ($0.02–$0.042 / 1M input, $0 output) — the complex-tier judge for dense packets and consensus gates.',
  },
  {
    id: 'typesafe',
    label: 'TypeSafe AI (jev-latest)',
    description:
      'Direct /v1/systemone endpoint ($0.042 / 1M input, $0 output) — the highest-precision System One provider.',
  },
];
