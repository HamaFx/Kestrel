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

// Stateless confirmation envelope for plugin tools with `requiresConfirmation`.
//
// Mastra's `requireApproval` suspends the stream with a `tool-call-approval`
// chunk that Kestrel's forwarders do not resume, so the tool never runs and the
// turn appears to hang. The tool adapter (`packages/ai/src/plugins/mastra-tools.ts`)
// therefore returns this envelope instead of executing: the model is told to ask
// the user, and the chat UI renders a one-click Confirm card that re-executes
// the tool through POST /api/plugins/<pluginId>/tools/<toolId>/confirm.
//
// Source of truth: packages/ai/src/plugins/mastra-tools.ts execute() return type.

import { z } from 'zod';

export const PLUGIN_TOOL_CONFIRM_KIND = 'plugin-tool-confirm';

/** Model-facing instruction carried by the envelope. */
export const PLUGIN_TOOL_CONFIRM_MESSAGE =
  'This action requires user confirmation before execution. Ask the user to click Confirm on the confirmation card.';

export const PluginToolConfirmUiSchema = z.object({
  kind: z.literal(PLUGIN_TOOL_CONFIRM_KIND),
  pluginId: z.string().min(1),
  toolId: z.string().min(1),
  description: z.string(),
  proposedInput: z.unknown(),
});
export type PluginToolConfirmUi = z.infer<typeof PluginToolConfirmUiSchema>;

export const PluginToolConfirmationResultSchema = z.object({
  status: z.literal('confirmation_required'),
  requiresConfirmation: z.literal(true),
  pluginId: z.string().min(1),
  toolId: z.string().min(1),
  description: z.string(),
  proposedInput: z.unknown(),
  message: z.string().min(1),
  _ui: PluginToolConfirmUiSchema,
});
export type PluginToolConfirmationResult = z.infer<typeof PluginToolConfirmationResultSchema>;

/** Confirm-card payload, or null when the output is not a confirmation envelope. */
export function extractPluginToolConfirm(output: unknown): PluginToolConfirmUi | null {
  const parsed = PluginToolConfirmationResultSchema.safeParse(output);
  return parsed.success ? parsed.data._ui : null;
}

/** Model-facing view: the `_ui` payload never reaches the model. */
export function pluginToolConfirmationModelOutput(result: PluginToolConfirmationResult): {
  status: 'confirmation_required';
  toolId: string;
  proposedInput: unknown;
  message: string;
} {
  return {
    status: result.status,
    toolId: result.toolId,
    proposedInput: result.proposedInput,
    message: result.message,
  };
}
