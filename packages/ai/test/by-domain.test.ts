/**
 * Copyright 2026 Kestrel
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

import { describe, expect, it } from 'vitest';

import { manifestToolsForDomain } from '../src/mastra-v2/capabilities';
import { resolveNativeCanonicalTool } from '../src/mastra-v2/tools/canonical';
import { domainToolFilter } from '../src/tools/by-domain';
import { registerAllTools } from '../src/tools/index';

// §4.3: tools register explicitly now — no import side effects.
registerAllTools();

/**
 * P2-01 removal: the seven natively-migrated tools (`get_price`, `get_candles`,
 * `get_indicators`, `get_market_structure`, `get_news`, `get_cot`,
 * `search_knowledge`) are served only by the native canonical registrations,
 * never by the legacy registry `domainToolFilter` reads. `setup.ts` merges the
 * two sources, so the domain manifests are satisfied by registry tools plus
 * native canonical tools. These tests pin both halves.
 */
const NATIVE_MIGRATED_TOOL_NAMES = [
  'get_price',
  'get_candles',
  'get_indicators',
  'get_market_structure',
  'get_news',
  'get_cot',
  'search_knowledge',
] as const;

describe('domainToolFilter', () => {
  it('returns the legacy registry tools for the generic domain', () => {
    const tools = domainToolFilter('generic', 'pro');
    expect(Object.keys(tools).length).toBeGreaterThan(10);
    expect(tools.get_session_levels).toBeDefined();
    expect(tools.analyze_technical).toBeDefined();
  });

  it('serves the migrated names through the native canonical registrations', () => {
    for (const name of NATIVE_MIGRATED_TOOL_NAMES) {
      expect(resolveNativeCanonicalTool(name), `native registration missing: ${name}`).toBeTruthy();
    }
  });

  it('every manifest name for a domain resolves from the registry or the native map', () => {
    for (const domain of ['summary', 'vision', 'fundamental', 'technical'] as const) {
      const tools = domainToolFilter(domain, 'pro');
      for (const name of manifestToolsForDomain(domain)) {
        expect(
          tools[name] !== undefined || resolveNativeCanonicalTool(name) !== null,
          `${domain}: ${name} resolved by neither source`,
        ).toBe(true);
      }
    }
  });

  it('excludes mutation tools from the fundamental domain', () => {
    const tools = domainToolFilter('fundamental', 'pro');
    expect(tools.get_correlation).toBeDefined();
    expect(tools.set_alert).toBeUndefined();
    expect(tools.log_journal).toBeUndefined();
  });

  it('includes fundamental-specific tools', () => {
    const tools = domainToolFilter('fundamental', 'pro');
    expect(tools.get_calendar).toBeDefined();
    expect(tools.analyze_fundamental).toBeDefined();
    expect(tools.get_correlation).toBeDefined();
    expect(tools.get_intermarket).toBeDefined();
    expect(tools.web_search).toBeDefined();
  });

  it('includes summary tools for summary routing', () => {
    const tools = domainToolFilter('summary', 'pro');
    expect(tools.get_calendar).toBeDefined();
    expect(tools.get_journal_stats).toBeDefined();
    expect(tools.get_social_sentiment).toBeDefined();
    // summarize_thread was removed in Phase 9 (legacy committee plane).
    expect(tools.summarize_thread).toBeUndefined();
    // Native-only names never appear in the legacy filter.
    expect(tools.get_candles).toBeUndefined();
  });

  it('includes vision tools for vision routing', () => {
    const tools = domainToolFilter('vision', 'pro');
    expect(tools.analyze_chart_image).toBeDefined();
    expect(tools.get_session_levels).toBeDefined();
    expect(tools.get_news).toBeUndefined();
  });

  it('excludes technical-only legacy tools from fundamental domain', () => {
    const tools = domainToolFilter('fundamental', 'pro');
    expect(tools.analyze_technical).toBeUndefined();
    expect(tools.annotate_chart).toBeUndefined();
  });

  it('excludes mutation tools from the technical domain', () => {
    const tools = domainToolFilter('technical', 'pro');
    expect(tools.get_session_levels).toBeDefined();
    expect(tools.set_alert).toBeUndefined();
    expect(tools.log_journal).toBeUndefined();
  });

  it('includes technical-specific tools', () => {
    const tools = domainToolFilter('technical', 'pro');
    expect(tools.get_session_levels).toBeDefined();
    expect(tools.analyze_technical).toBeDefined();
    expect(tools.analyze_chart_image).toBeDefined();
    expect(tools.replay_setup).toBeDefined();
  });

  it('excludes fundamental-only tools from technical domain', () => {
    const tools = domainToolFilter('technical', 'pro');
    expect(tools.get_calendar).toBeUndefined();
    expect(tools.analyze_fundamental).toBeUndefined();
    expect(tools.web_search).toBeUndefined();
    expect(tools.get_social_sentiment).toBeUndefined();
  });

  it('fails closed when the plan is missing or unknown', () => {
    expect(Object.keys(domainToolFilter('generic'))).toHaveLength(0);
    expect(Object.keys(domainToolFilter('generic', 'unknown'))).toHaveLength(0);
  });

  it('filters by plan when provided', () => {
    const tools = domainToolFilter('generic', 'free');
    expect(tools).toBeDefined();
    expect(typeof tools).toBe('object');
  });

  it('excludes tools not in the allowed set for a domain', () => {
    const technical = domainToolFilter('technical', 'pro');
    const technicalNames = new Set(Object.keys(technical));
    // Fundamental-only tools should not appear
    expect(technicalNames.has('get_calendar')).toBe(false);
    expect(technicalNames.has('analyze_fundamental')).toBe(false);
  });
});
