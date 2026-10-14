// SPDX-License-Identifier: Apache-2.0

/**
 * Audit upgrade-plan feature flags (docs/plans/kestrel-ai-agentic-audit-v2.md
 * and Audit v3 Q12).
 *
 * Single parsing point for every runtime flag read. The zod declarations in
 * `env.ts` document and validate the variables, but enforcement happens here
 * so the string semantics ('0'/'1'/'true'/'false', unset → documented default)
 * can never drift between call sites. Flags whose behavior is unconditional
 * in code (unified router, streaming progress, the completed mastra→mastra-v2
 * migration) were removed entirely — their rollback is `git revert`, not an
 * env var.
 */

export type FeatureFlagName =
  | 'PHASE2_PACKET_CACHE'
  | 'PHASE3_MODEL_DIVERSITY'
  | 'ENABLE_COMMITTEE_CRITIQUE'
  | 'PHASE3_STRUCTURED_FUSION'
  | 'ENABLE_COMMITTEE_DEBATE'
  | 'ENFORCE_BUDGET';

/** Documented defaults (Q12: PHASE3_STRUCTURED_FUSION enabled by default). */
const FLAG_DEFAULTS: Record<FeatureFlagName, boolean> = {
  PHASE2_PACKET_CACHE: true,
  PHASE3_MODEL_DIVERSITY: false,
  ENABLE_COMMITTEE_CRITIQUE: true,
  PHASE3_STRUCTURED_FUSION: true,
  ENABLE_COMMITTEE_DEBATE: false,
  ENFORCE_BUDGET: false,
};

/**
 * Read one flag with the documented semantics. No caching: tests mutate
 * `process.env` between cases, and a raw read is cheap.
 */
export function readFeatureFlag(name: FeatureFlagName): boolean {
  const raw = process.env[name];
  if (raw === '0' || raw === 'false') return false;
  if (raw === '1' || raw === 'true') return true;
  return FLAG_DEFAULTS[name];
}
