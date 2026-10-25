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

// /agents — list the user's standalone custom agents.

import type { BotReply, TelegramBotContext } from '../types';

export async function agentsReply(ctx: TelegramBotContext): Promise<BotReply> {
  try {
    const { getInstalledPluginRuntime, hasUserAgentCatalogs, listUserCustomAgents } =
      await import('@kestrel/ai/plugins');
    const runtime = await getInstalledPluginRuntime(ctx.userId);
    if (!hasUserAgentCatalogs(runtime)) {
      return {
        text: 'Custom Agents is not installed. Install it from Settings → Plugins in Kestrel, then create an agent in the Agent Studio.',
      };
    }
    const agents = await listUserCustomAgents(runtime);
    if (agents.length === 0) {
      return {
        text: 'You have no custom agents yet. Build one in Kestrel → Plugins → Custom Agents.',
      };
    }
    return {
      text: [
        '🧩 Your custom agents',
        '',
        ...agents.map((entry) => `@${entry.agent.slug} — ${entry.agent.name}`),
        '',
        'Ask one: /ask @handle your question',
      ].join('\n'),
    };
  } catch (err) {
    return {
      text: `Could not load your agents right now: ${
        err instanceof Error ? err.message : 'please retry later'
      }`,
    };
  }
}
