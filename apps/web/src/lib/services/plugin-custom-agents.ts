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

// Custom-agent request resolution.
//
// Chat routes must not import `@kestrel/*` directly. This service owns the
// `@handle` parsing, runtime/catalog lookup, and prompt extraction, so the
// dispatcher only maps a typed resolution to HTTP.

import 'server-only';

import {
  getInstalledPluginRuntime,
  hasUserAgentCatalogs,
  parseCustomAgentMention,
  resolveUserCustomAgent,
  stripCustomAgentMention,
  type CustomAgentDescriptor,
  type InstalledPluginRuntime,
} from '@kestrel/ai/plugins';

export type CustomAgentResolution =
  | { status: 'none' }
  | { status: 'unavailable' }
  | { status: 'not-found'; slug: string }
  | {
      status: 'resolved';
      slug: string;
      prompt: string;
      descriptor: CustomAgentDescriptor;
      runtime: InstalledPluginRuntime;
    };

export interface ResolveCustomAgentInput {
  userId: string;
  userText: string;
  /** Explicit composer selection, when the user picked an agent by name. */
  agentSlug?: string | null;
}

/**
 * Resolve an `@handle` or explicit agent selection to a runnable descriptor.
 * Returns `none` when the turn is not aimed at a custom agent, and
 * `unavailable` when the user has no installed agent catalogs.
 */
export async function resolveCustomAgentRequest(
  input: ResolveCustomAgentInput,
): Promise<CustomAgentResolution> {
  const mention = parseCustomAgentMention(input.userText);
  const requestedSlug = mention?.slug ?? input.agentSlug ?? null;
  if (!requestedSlug) return { status: 'none' };

  const runtime = await getInstalledPluginRuntime(input.userId);
  if (!hasUserAgentCatalogs(runtime) && !input.agentSlug) {
    return { status: 'unavailable' };
  }

  const descriptor = await resolveUserCustomAgent(runtime, requestedSlug);
  if (!descriptor) return { status: 'not-found', slug: requestedSlug };

  const prompt =
    mention?.slug === descriptor.agent.slug
      ? mention.prompt
      : stripCustomAgentMention(input.userText, descriptor.agent.slug);

  return {
    status: 'resolved',
    slug: descriptor.agent.slug,
    prompt,
    descriptor,
    runtime,
  };
}
