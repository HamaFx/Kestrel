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

// Tool: set_alert.
//
// Lets the model create a one-shot alert. Mirrors the AlertRule schema
// directly so the tool input is the same shape the DB row stores.

import {
  AlertChannelSchema,
  AlertRuleSchema,
  isPriceLevelRule,
  validationError,
  type SetAlertOutput,
} from '@kestrel/shared';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { createAlert } from '../alerts/persistence';
import { describeRule } from '../alerts/rule-registry';
import { checkLevelsAgainstMarket } from '../mastra-v2/mutation/level-sanity';
import { getToolContext, maybeGetToolContext } from '../runtime/tool-context';
import { assertMutationIntent } from './mutation-guard';

const InputSchema = z.object({
  rule: AlertRuleSchema,
  channels: z.array(AlertChannelSchema).default(['email']),
  note: z.string().max(280).nullable().default(null),
});

declare module '@kestrel/shared' {
  interface ToolIOMap {
    set_alert: { input: z.infer<typeof InputSchema> };
  }
}

export const setAlertTool: Tool<z.infer<typeof InputSchema>, SetAlertOutput> = tool({
  description:
    'Create a one-shot price / indicator / candle-close alert. Fires when the rule first matches and then deactivates. The user can resend by editing the alert in /alerts.',
  inputSchema: InputSchema,
  execute: async ({ rule, channels, note }): Promise<SetAlertOutput> => {
    assertMutationIntent('set_alert');

    // R13 (audit 2026-10-31): a price-rule level is checked against the live
    // market before the row is written, exactly like the journal's trade
    // levels. The alert band is deliberately wide (an alert is
    // forward-looking: "tell me when gold reaches 3,300" is legitimate far
    // from the current price), so this only refuses a level no market could
    // print for the symbol. Out of band is a hard failure with the reason and
    // never a clamped substitute; an unavailable market fails closed and
    // leaves nothing written.
    //
    // Indicator levels are not prices (an RSI of 30, a MACD below zero), so
    // they keep the schema-only bound — see `isPriceLevelRule`.
    if (isPriceLevelRule(rule)) {
      const signal = maybeGetToolContext()?.signal ?? undefined;
      const levelCheck = await checkLevelsAgainstMarket({
        symbol: rule.symbol,
        levels: [{ name: 'level', value: rule.level }],
        band: 'alert',
        ...(signal ? { signal } : {}),
      });
      if (!levelCheck.ok) {
        throw validationError(`Alert not created: ${levelCheck.message}`);
      }
    }

    const alert = await createAlert({ userId: getToolContext().userId, rule, channels, note });
    return { alertId: alert.id, describes: describeRule(rule) };
  },
});
