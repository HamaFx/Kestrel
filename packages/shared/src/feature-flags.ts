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
  | 'ENFORCE_BUDGET'
  | 'ENABLE_GENERIC_MACRO'
  | 'ENABLE_COMPARISON_RISK_DESK'
  | 'PHASE_TOOLS_SHIMS'
  | 'CREDITS_ENFORCEMENT_ENABLED'
  | 'CREDITS_SHADOW_LOG';

/** Documented defaults (Q12: PHASE3_STRUCTURED_FUSION enabled by default). */
const FLAG_DEFAULTS: Record<FeatureFlagName, boolean> = {
  PHASE2_PACKET_CACHE: true,
  PHASE3_MODEL_DIVERSITY: false,
  ENABLE_COMMITTEE_CRITIQUE: true,
  PHASE3_STRUCTURED_FUSION: true,
  ENABLE_COMMITTEE_DEBATE: false,
  ENFORCE_BUDGET: false,
  ENABLE_GENERIC_MACRO: true,
  ENABLE_COMPARISON_RISK_DESK: true,
  PHASE_TOOLS_SHIMS: true,
  // Plan §15.3 — shadow metering first; enforcement is an explicit opt-in.
  CREDITS_ENFORCEMENT_ENABLED: false,
  CREDITS_SHADOW_LOG: true,
};

/**
 * M-02 rollout gate (audit 2026-10-18, Phases 0/2): while the generic macro
 * packet was being landed the default stayed off in production so the merge
 * could not change prod behavior; M-02 has landed (contract test:
 * `generic-macro-packet.test.ts`), so the packet is on by default everywhere.
 * An explicit `ENABLE_GENERIC_MACRO=0` is the instant rollback to the
 * candle-only packet in any environment.
 */
function defaultFor(name: FeatureFlagName): boolean {
  return FLAG_DEFAULTS[name];
}

/**
 * Read one flag with the documented semantics. No caching: tests mutate
 * `process.env` between cases, and a raw read is cheap.
 */
export function readFeatureFlag(name: FeatureFlagName): boolean {
  const raw = process.env[name];
  if (raw === '0' || raw === 'false') return false;
  if (raw === '1' || raw === 'true') return true;
  return defaultFor(name);
}
