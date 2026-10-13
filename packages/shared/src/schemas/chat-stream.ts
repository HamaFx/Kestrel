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

import { z } from 'zod';

const baseEvent = z.object({ id: z.string() });

export const TextStartEventSchema = baseEvent.extend({ type: z.literal('text-start') });
export const TextDeltaEventSchema = baseEvent.extend({
  type: z.literal('text-delta'),
  delta: z.string(),
});
export const TextEndEventSchema = baseEvent.extend({ type: z.literal('text-end') });
export const MultiAgentMetaEventSchema = baseEvent.extend({
  type: z.literal('data-multi-agent-meta'),
  data: z.record(z.unknown()),
  transient: z.boolean().optional(),
});
export const AgentProgressEventSchema = z.object({
  type: z.literal('data-agent-progress'),
  // Intentionally id-less: the tracker lives in @kestrel/ai and does not
  // know the message id. The transport synthesizes its own id for the
  // resulting AI SDK data stream.
  data: z.unknown(),
});
export const ErrorEventSchema = z.object({
  type: z.literal('error'),
  errorText: z.string(),
});
export const TurnCompleteEventSchema = z.object({
  type: z.literal('turn-complete'),
  id: z.string(),
  status: z.enum(['persisted', 'persistence-failed', 'interrupted', 'failed']),
});

// AI SDK v5 tool stream chunks (audit v3 P0-1). Shapes mirror the AI SDK v5
// `UIMessageChunk` data-stream protocol one-for-one so the client transport
// can forward them to `useChat` unchanged and live `tool-<name>` message
// parts render generative UI cards.
export const ToolInputStartChunkSchema = z.object({
  type: z.literal('tool-input-start'),
  toolCallId: z.string(),
  toolName: z.string(),
});

export const ToolInputDeltaChunkSchema = z.object({
  type: z.literal('tool-input-delta'),
  toolCallId: z.string(),
  inputTextDelta: z.string(),
});

export const ToolInputAvailableChunkSchema = z.object({
  type: z.literal('tool-input-available'),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
});

export const ToolOutputAvailableChunkSchema = z.object({
  type: z.literal('tool-output-available'),
  toolCallId: z.string(),
  output: z.unknown(),
});

export const ToolOutputErrorChunkSchema = z.object({
  type: z.literal('tool-output-error'),
  toolCallId: z.string(),
  errorText: z.string(),
});

/**
 * Emitted when the canonical evidence gate blocks an answer after tokens
 * already streamed (Q10). The client replaces the unverified text with this
 * message instead of concatenating a refusal onto it.
 */
export const DataEvidenceBlockedChunkSchema = z.object({
  type: z.literal('data-evidence-blocked'),
  data: z.object({
    message: z.string(),
  }),
});

/**
 * Live variant of the persisted `data-memory-degraded` part (audit v3 P0-1):
 * without it the transport dropped the event and flagged a protocol error.
 * The payload mirrors `MemoryDegradedPartSchema` minus the literal type.
 */
export const MemoryDegradedEventSchema = z.object({
  type: z.literal('data-memory-degraded'),
  data: z.object({
    reason: z.string().max(200),
    createdAt: z.number().int().optional(),
  }),
});

/** Strict user-authored parts allowed into durable AI queue payloads. */
export const UserMessageTextPartSchema = z.object({
  type: z.literal('text'),
  text: z.string().max(50_000),
});
export const UserMessageFilePartSchema = z.object({
  type: z.literal('file'),
  url: z.string().url().max(2_048),
  mediaType: z
    .string()
    .regex(/^[a-z]+\/[a-z0-9.+-]+$/i)
    .max(120),
  filename: z.string().max(255).optional(),
});
export const UserMessagePartSchema = z.discriminatedUnion('type', [
  UserMessageTextPartSchema,
  UserMessageFilePartSchema,
]);
export const UserMessagePartsSchema = z.array(UserMessagePartSchema).max(50);
export type UserMessagePart = z.infer<typeof UserMessagePartSchema>;
export const AnalysisQueuedEventSchema = z.object({
  type: z.literal('analysis-queued'),
  jobId: z.string(),
  status: z.string(),
});

/**
 * The server's chat route returns this JSON when a prompt is routed to the
 * mutation confirmation workflow. The payload is the draft's suspend card:
 * the client renders it and presents the single-use token back on confirm.
 */
export const MutationDraftPayloadSchema = z.object({
  mutation: z.enum(['set_alert', 'log_journal', 'share_snapshot', 'run_system_action']),
  summary: z.string(),
  runId: z.string(),
  expiresAt: z.number().int(),
  confirmationToken: z.string(),
  confirmLabel: z.string().optional(),
  cancelLabel: z.string().optional(),
});
export type MutationDraftPayload = z.infer<typeof MutationDraftPayloadSchema>;

export const MutationDraftEventSchema = z.object({
  type: z.literal('mutation-draft'),
  payload: MutationDraftPayloadSchema,
});
export type MutationDraftEvent = z.infer<typeof MutationDraftEventSchema>;

export const MutationConfirmResultSchema = z.object({
  ok: z.boolean(),
  status: z.literal('executed'),
  runId: z.string(),
  output: z
    .object({
      status: z.enum(['executed', 'rejected']),
      mutation: z.enum(['set_alert', 'log_journal', 'share_snapshot', 'run_system_action']),
      resultId: z.string().nullable(),
      url: z.string().nullable(),
      summary: z.string(),
    })
    .optional(),
});
export type MutationConfirmResult = z.infer<typeof MutationConfirmResultSchema>;

export const ChatStreamEventSchema = z.discriminatedUnion('type', [
  TextStartEventSchema,
  TextDeltaEventSchema,
  TextEndEventSchema,
  MultiAgentMetaEventSchema,
  AgentProgressEventSchema,
  ToolInputStartChunkSchema,
  ToolInputDeltaChunkSchema,
  ToolInputAvailableChunkSchema,
  ToolOutputAvailableChunkSchema,
  ToolOutputErrorChunkSchema,
  DataEvidenceBlockedChunkSchema,
  MemoryDegradedEventSchema,
  ErrorEventSchema,
  TurnCompleteEventSchema,
]);

export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;
