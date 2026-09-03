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

/**
 * H3 — Domain-based tool subsetting.
 *
 * Maps each routing domain to the subset of tools relevant to that domain.
 * Reduces per-turn token overhead by 60-80% (from ~2000-4000 tokens of
 * tool descriptions down to ~400-800 for typical turns).
 *
 * Domains:
 *   - fundamental: news, calendar, CoT, fundamentals analysis, sentiment
 *   - technical: price, candles, indicators, structure, session levels
 *   - summary: news/calendar/journal recap tools
 *   - vision: chart-image analysis plus supporting technical data
 *   - generic: keep all tools (fallback for unclassified messages)
 *
 * Mutation tools are intentionally excluded here. They are handled only by
 * the explicit confirmation workflow; canonical Mastra agents apply an
 * additional read-only allowlist at their composition boundary.
 */

import type { Tool } from 'ai';

import { manifestToolsForDomain } from '../mastra/capabilities';
import { toolRegistry } from './index';

export type RoutingDomain = 'fundamental' | 'technical' | 'summary' | 'vision' | 'generic';

/**
 * Return a filtered copy of the tool registry containing only tools
 * relevant to the given routing domain. 'generic' domains get all tools.
 */
/**
 * Filter tools by routing domain, with optional per-tenant plan gating (PF-16).
 *
 * @param domain - The routing domain to filter for.
 * @param plan - Authenticated tenant plan. Missing or unknown plans fail closed.
 */
export function domainToolFilter(domain: RoutingDomain, plan?: string): Record<string, Tool> {
  const allTools = toolRegistry.resolveForPlan(undefined, plan);

  if (domain === 'generic') return allTools;

  const allowed = manifestToolsForDomain(domain);
  const filtered: Record<string, Tool> = {};
  for (const name of allowed) {
    const tool = allTools[name];
    if (tool) filtered[name] = tool;
  }
  return filtered;
}
