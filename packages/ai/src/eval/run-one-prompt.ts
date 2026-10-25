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

// One eval case: create a thread, POST /api/chat, consume the stream.

import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { computeCitationScore } from './citation-oracle';
import { consumeUIMessageStream } from './parse-stream';
import type { PromptDef, PromptResult } from './types';

interface RunOnePromptArgs {
  prompt: PromptDef;
  baseUrl: string;
  cookie: string;
  timeoutMs: number;
}

function trimTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

export async function runOnePrompt(args: RunOnePromptArgs): Promise<PromptResult> {
  const { prompt, baseUrl, cookie, timeoutMs } = args;
  const messageId = randomUUID();

  // Create a fresh thread first so the FK from chat_messages.thread_id is
  // satisfied. Sending an arbitrary UUID straight to /api/chat would 500
  // because the foreign key references chat_threads(id).
  let threadId: string;
  try {
    threadId = await createThread({ baseUrl, cookie, timeoutMs });
  } catch (err) {
    return {
      id: prompt.id,
      prompt: prompt.prompt,
      ttftMs: null,
      totalMs: 0,
      text: '',
      toolCalls: [],
      agentProgress: [],
      metadata: {},
      terminalStatus: null,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // The /api/chat route validates with zod:
  //   { threadId: uuid, messages: [{ id, role, parts: unknown[] }, ...] }
  // and treats the last message as the user's turn.
  const body = JSON.stringify({
    threadId,
    messages: [
      {
        id: messageId,
        role: 'user',
        parts: [{ type: 'text', text: prompt.prompt }],
      },
    ],
    ...(prompt.analysisMode ? { analysisMode: prompt.analysisMode } : {}),
  });

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  const startedAt = Date.now();
  const startedAtMono = performance.now();

  try {
    const response = await fetch(`${trimTrailingSlash(baseUrl)}/api/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        cookie,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await safeReadText(response);
      const totalMs = Math.round(performance.now() - startedAtMono);
      return {
        id: prompt.id,
        prompt: prompt.prompt,
        ttftMs: null,
        totalMs,
        text: '',
        toolCalls: [],
        agentProgress: [],
        metadata: {},
        terminalStatus: null,
        ok: false,
        error: `HTTP ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 500)}` : ''}`,
      };
    }

    const parsed = await consumeUIMessageStream(response, { startedAt });
    const terminalStatus = parsed.agentProgress.at(-1)?.status ?? null;
    const expectedFailure = prompt.expectedTerminalStatus === 'failed';
    if (parsed.errors.length > 0 && !expectedFailure) {
      return {
        id: prompt.id,
        prompt: prompt.prompt,
        ttftMs: parsed.ttftMs,
        totalMs: parsed.totalMs,
        text: parsed.text,
        toolCalls: parsed.toolCalls,
        agentProgress: parsed.agentProgress,
        metadata: parsed.metadata,
        terminalStatus,
        ok: false,
        error: `stream error: ${parsed.errors.join('; ')}`,
        assistantMessageId: parsed.assistantMessageId,
      };
    }
    return {
      id: prompt.id,
      prompt: prompt.prompt,
      ttftMs: parsed.ttftMs,
      totalMs: parsed.totalMs,
      text: parsed.text,
      toolCalls: parsed.toolCalls,
      agentProgress: parsed.agentProgress,
      metadata: parsed.metadata,
      terminalStatus,
      ok: true,
      citationScore: computeCitationScore(parsed.text, parsed.toolCalls),
      ...(parsed.errors.length > 0
        ? { error: `expected terminal failure: ${parsed.errors.join('; ')}` }
        : {}),
      assistantMessageId: parsed.assistantMessageId,
    };
  } catch (err) {
    const totalMs = Math.round(performance.now() - startedAtMono);
    const aborted = controller.signal.aborted;
    const message = aborted
      ? `timeout after ${timeoutMs}ms`
      : err instanceof Error
        ? err.message
        : String(err);
    return {
      id: prompt.id,
      prompt: prompt.prompt,
      ttftMs: null,
      totalMs,
      text: '',
      toolCalls: [],
      agentProgress: [],
      metadata: {},
      terminalStatus: null,
      ok: false,
      error: message,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

interface CreateThreadArgs {
  baseUrl: string;
  cookie: string;
  timeoutMs: number;
}

async function createThread(args: CreateThreadArgs): Promise<string> {
  const { baseUrl, cookie, timeoutMs } = args;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${trimTrailingSlash(baseUrl)}/api/chat/threads`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: '{}',
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await safeReadText(response);
      throw new Error(
        `failed to create thread: HTTP ${response.status} ${response.statusText}${
          text ? `: ${text.slice(0, 500)}` : ''
        }`,
      );
    }
    const json = (await response.json()) as { thread?: { id?: unknown } };
    const id = json.thread?.id;
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error('thread create returned no id');
    }
    return id;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// --- prompt loading --------------------------------------------------------
