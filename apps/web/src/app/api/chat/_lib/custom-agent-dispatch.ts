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

// SPDX-License-Identifier: Apache-2.0

// Standalone custom agents (`@handle` or an explicit composer pick).
//
// A user-authored agent is a separate Mastra agent, not a committee route.
// It is intercepted before the router so selection is deterministic and
// cheap; the normal guards (rate limit, onboarding, injection) still apply.

import type { UIMessage } from 'ai';

import { isInjectionAttempt } from '@/lib/services/api-boundary';
import { runCustomAgentStreamService } from '@/lib/services/mastra/chat-orchestrator';
import {
  getInstalledPluginRuntime,
  hasUserAgentCatalogs,
  parseCustomAgentMention,
  resolveUserCustomAgent,
  stripCustomAgentMention,
} from '@/lib/services/plugin-custom-agents';

import { ROUTE_TIMEOUT_MS } from './constants';
import { errorJson } from './errors';
import type { PresentationPrefs } from './presentation-prefs';

export async function dispatchCustomAgent(args: {
  userId: string;
  threadId: string;
  userMessage: UIMessage;
  userText: string;
  agentSlug: string | undefined;
  modelOverride: string | null | undefined;
  prefs: PresentationPrefs;
  requestSignal: AbortSignal | null;
}): Promise<Response | null> {
  const agentMention = parseCustomAgentMention(args.userText);
  const requestedAgentSlug = agentMention?.slug ?? args.agentSlug ?? null;
  if (!requestedAgentSlug) return null;

  const runtime = await getInstalledPluginRuntime(args.userId);
  const catalogsAvailable = hasUserAgentCatalogs(runtime);
  if (!catalogsAvailable && !args.agentSlug) return null;

  const descriptor = await resolveUserCustomAgent(runtime, requestedAgentSlug);
  if (!descriptor) {
    return errorJson(
      'AGENT_NOT_FOUND',
      `No custom agent @${requestedAgentSlug} was found. Open the Agent Studio to create it.`,
      404,
    );
  }
  if (isInjectionAttempt(args.userText)) {
    return errorJson(
      'READ_ONLY_REQUEST_REQUIRED',
      'I can help with read-only research, but I cannot process instruction-overriding requests.',
      422,
    );
  }

  const prompt =
    agentMention?.slug === descriptor.agent.slug
      ? agentMention.prompt
      : stripCustomAgentMention(args.userText, descriptor.agent.slug);
  if (!prompt.trim()) {
    return errorJson(
      'VALIDATION',
      `Add a question after @${descriptor.agent.slug}, e.g. "@${descriptor.agent.slug} review XAUUSD 15m".`,
      400,
    );
  }

  const timeout = AbortSignal.timeout(ROUTE_TIMEOUT_MS);
  const signal = args.requestSignal ? AbortSignal.any([args.requestSignal, timeout]) : timeout;
  return runCustomAgentStreamService({
    userId: args.userId,
    threadId: args.threadId,
    userMessage: args.userMessage,
    prompt,
    descriptor,
    runtime,
    ...(args.prefs.customInstructions ? { customInstructions: args.prefs.customInstructions } : {}),
    ...(args.prefs.responseStyle !== 'default' ? { responseStyle: args.prefs.responseStyle } : {}),
    citeSources: args.prefs.citeSources,
    ...(args.modelOverride !== undefined ? { modelOverride: args.modelOverride } : {}),
    signal,
  });
}
