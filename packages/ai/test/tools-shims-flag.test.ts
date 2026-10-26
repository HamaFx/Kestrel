// SPDX-License-Identifier: Apache-2.0

// P2-01 (audit 2026-10-18) — the legacy AI SDK shims in `src/tools/` are
// one-release compat for the seven tools that already have native Mastra
// registrations. `PHASE_TOOLS_SHIMS=0` must prove the native path before the
// shims' dated deletion: the shims are not registered, specialist desks and
// canonical-chat still resolve the native tools, and the module-init allowlist
// assertion accepts native registrations instead of failing loudly.

import { afterAll, describe, expect, it, vi } from 'vitest';

import { resolveSpecialistDeskTools } from '../src/committee/specialists';
import { nativeCanonicalTools } from '../src/mastra-v2/tools/canonical';
import { registerJournalTools } from '../src/tools/journal';
import { NATIVE_MIGRATED_TOOL_NAMES, registerMarketTools } from '../src/tools/market';
import { ToolRegistry } from '../src/tools/registry';

/** Boot the two legacy categories that own the migrated shims. */
function registerAllLegacyCategories(registry: ToolRegistry): void {
  registerMarketTools(registry);
  registerJournalTools(registry);
}

afterAll(() => {
  delete process.env.PHASE_TOOLS_SHIMS;
});

describe('PHASE_TOOLS_SHIMS (P2-01)', () => {
  it('keeps the migrated-name list in sync with the native canonical registrations', () => {
    expect([...NATIVE_MIGRATED_TOOL_NAMES].sort()).toEqual(
      Object.keys(nativeCanonicalTools()).sort(),
    );
  });

  it('registers the legacy shims by default (one-release compat)', () => {
    delete process.env.PHASE_TOOLS_SHIMS;
    const registry = new ToolRegistry();
    registerAllLegacyCategories(registry);
    for (const name of NATIVE_MIGRATED_TOOL_NAMES) {
      expect(registry.has(name)).toBe(true);
    }
  });

  it('skips the migrated shims when disabled, keeping the rest of the market tools', () => {
    process.env.PHASE_TOOLS_SHIMS = '0';
    try {
      const registry = new ToolRegistry();
      registerAllLegacyCategories(registry);
      for (const name of NATIVE_MIGRATED_TOOL_NAMES) {
        expect(registry.has(name)).toBe(false);
      }
      // Unmigrated market tools are still registered from their legacy modules.
      expect(registry.has('get_correlation')).toBe(true);
      expect(registry.has('get_session_levels')).toBe(true);
    } finally {
      delete process.env.PHASE_TOOLS_SHIMS;
    }
  });

  it('resolves specialist desk tools from the native registrations, shim flag or not', () => {
    process.env.PHASE_TOOLS_SHIMS = '0';
    try {
      const technical = resolveSpecialistDeskTools('technical');
      // Native-first resolution: the desks hold the exact native objects,
      // so disabling the shims cannot strip their market-data tools.
      expect(technical.get_price).toBe(nativeCanonicalTools().get_price);
      expect(technical.get_candles).toBe(nativeCanonicalTools().get_candles);
      expect(technical.get_indicators).toBe(nativeCanonicalTools().get_indicators);
      // Unmigrated names keep their adapted legacy tool.
      expect(technical.get_session_levels).toBeDefined();
    } finally {
      delete process.env.PHASE_TOOLS_SHIMS;
    }
  });

  it('satisfies the canonical allowlist assertion with the shims disabled', async () => {
    // A fresh module graph re-runs `assertCanonicalToolAllowlist()` at import
    // time with the flag off. Before P2-01 this threw
    // `Canonical read-only allowlist references unregistered tools: ...`.
    vi.resetModules();
    process.env.PHASE_TOOLS_SHIMS = '0';
    try {
      const canonical = await import('../src/mastra-v2/agents/canonical');
      expect(canonical.CANONICAL_READ_ONLY_TOOL_NAMES.length).toBeGreaterThan(0);
    } finally {
      delete process.env.PHASE_TOOLS_SHIMS;
      vi.resetModules();
    }
  });
});
