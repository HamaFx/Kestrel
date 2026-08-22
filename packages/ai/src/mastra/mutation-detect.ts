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
 * Mutation-intent classification for the chat boundary.
 *
 * The chat route rejects non-read-only prompts by default. When the mutation
 * capability is enabled, a prompt that clearly asks for a supported mutation
 * (set an alert, log a journal entry, share a snapshot, run a system action)
 * is routed to the draft workflow instead of being rejected.
 *
 * Deliberately high-precision / low-recall: ambiguous phrasing stays in the
 * read-only rejection so we never spend an extraction call on a request that
 * was not really a mutation. Matches are case-insensitive word/phrase checks.
 */

import { MutationKindSchema, type MutationKind } from '../mastra-v2/workflows/mutation';

const PATTERNS: Record<MutationKind, RegExp> = {
  set_alert:
    /\b(?:set|create|add|make|schedule|send)\b[\s\S]{0,60}?\balert\b|\balert\s+me\b|\bnotify\s+me\b|\bremind\s+me\b|\bwatch\s+for\b/i,
  log_journal:
    /\b(?:log|record|add|write|journal|note)\b[\s\S]{0,60}?\b(?:trade|journal|entry|position|transaction)\b|\b(?:trade|journal|position)\b[\s\S]{0,40}?\b(?:log|record|add|write|entry)\b/i,
  share_snapshot:
    /\b(?:share|send|export|publish)\b[\s\S]{0,40}?\b(?:snapshot|summary|analysis|report|link)\b|\bshare\s+this\b/i,
  run_system_action:
    /\b(?:run|execute|trigger|perform)\b[\s\S]{0,40}?\b(?:system\s+action|maintenance|cleanup|diagnostic|backup)\b|\bsystem\s+action\b/i,
};

/**
 * Classify a chat prompt as a mutation request. Returns the matched mutation
 * kind or null when the prompt is not clearly a mutation.
 */
export function classifyMutationRequest(text: string): MutationKind | null {
  if (!text || text.trim().length < 4) return null;
  for (const kind of MutationKindSchema.options) {
    if (PATTERNS[kind].test(text)) return kind;
  }
  return null;
}

/**
 * True when the mutation capability is explicitly enabled by the operator.
 * Mirrors the mutation-policy gate so the chat route can short-circuit before
 * the read-only rejection without invoking policy exceptions.
 */
export function isMastraMutationEnabled(): boolean {
  return process.env.ENABLE_MASTRA_MUTATIONS === 'true';
}
