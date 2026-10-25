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

// Request validation for /api/chat: body schema, last-message gate, server
// env, and the presentation-preference header.

import { z } from 'zod';

import { getServerEnv } from '@/lib/env';
import { errorResponse, parseJsonBody } from '@/lib/http/api';
import { UserMessagePartsSchema } from '@/lib/services/api-boundary';

import { errorJson } from './errors';
import { readPresentationPrefs, type PresentationPrefs } from './presentation-prefs';

export const BodySchema = z.object({
  threadId: z.uuid(),
  modelOverride: z.string().min(1).max(120).nullable().optional(),
  // Q2 decision: exactly two analysis modes; anything else fails validation.
  analysisMode: z.enum(['single', 'full']).optional(),
  /** Explicit standalone agent selection from the composer. */
  agentSlug: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z][a-z0-9-]{1,31}$/)
    .optional(),
  messages: z
    .array(
      z.object({
        id: z.string().max(200),
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().max(50_000, 'Message too long').default(''),
        parts: z.array(z.unknown()).max(50, 'Too many message parts').default([]),
      }),
    )
    .min(1)
    .max(100, 'Too many messages'),
});

export type ChatRequestBody = z.infer<typeof BodySchema>;
export type ChatUserMessage = ChatRequestBody['messages'][number];
export type ChatUserParts = z.infer<typeof UserMessagePartsSchema>;

export interface ParsedChatRequest extends PresentationPrefs {
  body: ChatRequestBody;
  serverEnv: ReturnType<typeof getServerEnv>;
  userParts: ChatUserParts;
  last: ChatUserMessage;
}

export type ParseChatRequestResult =
  { ok: true; request: ParsedChatRequest } | { ok: false; response: Response };

export async function parseChatRequest(req: Request): Promise<ParseChatRequestResult> {
  let body: ChatRequestBody;
  try {
    body = await parseJsonBody(req, BodySchema);
  } catch (error) {
    return { ok: false, response: errorResponse(error) };
  }

  const last = body.messages.at(-1);
  if (!last || last.role !== 'user') {
    return {
      ok: false,
      response: errorJson('VALIDATION', 'last message must be from the user', 400),
    };
  }
  const userParts = UserMessagePartsSchema.safeParse(last.parts);
  if (!userParts.success) {
    return {
      ok: false,
      response: errorJson(
        'VALIDATION',
        'user message contains unsupported or malformed parts',
        400,
      ),
    };
  }

  let serverEnv: ReturnType<typeof getServerEnv>;
  try {
    serverEnv = getServerEnv();
  } catch (error) {
    return { ok: false, response: errorResponse(error) };
  }

  const prefs = readPresentationPrefs(req.headers.get('X-AI-Prefs'));

  return {
    ok: true,
    request: { body, serverEnv, userParts: userParts.data, last, ...prefs },
  };
}
