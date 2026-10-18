// SPDX-License-Identifier: Apache-2.0

/**
 * P2-01 (audit 2026-10-18, Phase 5) — the tool names whose implementation
 * moved to native Mastra registrations in `mastra-v2/tools/canonical/`.
 *
 * Their legacy AI SDK `Tool` wrappers in `src/tools/` are one-release wire
 * compatibility. With `PHASE_TOOLS_SHIMS=0` the legacy registrations are
 * skipped so a deployment can prove the native path serves every internal
 * consumer before the shims' dated deletion (see CHANGELOG; removal target
 * 2026-12-15).
 *
 * Keep this list exactly equal to `NATIVE_CANONICAL_TOOLS`'s keys —
 * `tools-shims-flag.test.ts` asserts the sync so a new native migration
 * cannot silently leave its shim ungated.
 */

const MIGRATED = [
  'get_price',
  'get_candles',
  'get_indicators',
  'get_market_structure',
  'get_news',
  'get_cot',
  'search_knowledge',
] as const;

const MIGRATED_SET = new Set<string>(MIGRATED);

export const NATIVE_MIGRATED_TOOL_NAMES: readonly string[] = MIGRATED;

/** True when the name is served natively (its legacy shim is gate-controlled). */
export function isNativeMigratedTool(name: string): boolean {
  return MIGRATED_SET.has(name);
}
