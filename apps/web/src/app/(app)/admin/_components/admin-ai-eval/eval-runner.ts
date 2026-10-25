// SPDX-License-Identifier: Apache-2.0

// Chat-route runner for the AI eval sweep: thread creation, SSE reading,
// rate-limit detection and the pacing constants.
import { getCsrfToken } from '@/lib/auth/csrf';

export interface EvalRow {
  id: string;
  prompt: string;
  status: 'pending' | 'running' | 'ok' | 'failed';
  totalMs?: number;
  chars?: number;
  error?: string;
}

export interface RunOneResult {
  ok: boolean;
  totalMs: number;
  text: string;
  error?: string;
}

export const REQUEST_TIMEOUT_MS = 120_000;
/**
 * Gap between prompts. Kept generous because each Mastra report makes
 * several LLM calls (report + repair), and free-tier
 * provider keys (e.g. Mistral) trip their request rate limits when 30 prompts
 * are fired back-to-back. 25s keeps us under typical free-tier RPM bounds.
 */
export const BETWEEN_PROMPTS_DELAY_MS = 25_000;
/** Retry a prompt up to this many times when the provider rate-limits us. */
export const MAX_RATE_LIMIT_RETRIES = 3;
/** Wait this long before retrying a rate-limited prompt (first backoff). */
export const RATE_LIMIT_RETRY_DELAY_MS = 45_000;

export async function createThread(): Promise<string> {
  const csrf = getCsrfToken();
  const res = await fetch('/api/chat/threads', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: '{}',
  });
  if (!res.ok) {
    throw new Error(`Thread creation failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { thread?: { id?: string } };
  const id = json.thread?.id;
  if (typeof id !== 'string' || id.length === 0) throw new Error('Thread creation returned no id');
  return id;
}

/** True when a result (HTTP status or stream error) is a provider rate limit. */
export function isRateLimit(result: RunOneResult): boolean {
  if (!result.ok) {
    const msg = result.error?.toLowerCase() ?? '';
    return (
      result.error?.startsWith('HTTP 429') === true ||
      msg.includes('too many requests') ||
      msg.includes('rate limit')
    );
  }
  return false;
}

export async function runOnePrompt(threadId: string, prompt: string): Promise<RunOneResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const csrf = getCsrfToken();
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({
        threadId,
        messages: [
          {
            id: crypto.randomUUID(),
            role: 'user',
            parts: [{ type: 'text', text: prompt }],
          },
        ],
      }),
      signal: controller.signal,
    });
    const totalMs = Date.now() - startedAt;

    if (!res.ok) {
      let detail = '';
      try {
        const json = (await res.json()) as { error?: { message?: string } };
        detail = json.error?.message ?? '';
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        totalMs,
        text: '',
        error: `HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
      };
    }

    const text = await readSseText(res);
    const error =
      text.error ?? (text.text.length === 0 ? 'Stream closed without assistant text' : undefined);
    return {
      ok: !error,
      totalMs,
      text: text.text,
      error,
    };
  } catch (err) {
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      totalMs: Date.now() - startedAt,
      text: '',
      error: aborted
        ? `Timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err),
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export function parseSseEvent(
  raw: string,
): { type?: string; delta?: string; errorText?: string } | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      ...(typeof parsed.type === 'string' ? { type: parsed.type } : {}),
      ...(typeof parsed.delta === 'string' ? { delta: parsed.delta } : {}),
      ...(typeof parsed.errorText === 'string' ? { errorText: parsed.errorText } : {}),
    };
  } catch {
    return null;
  }
}

/** Minimal SSE reader for the chat stream: collects text, surfaces errors. */
export async function readSseText(res: Response): Promise<{ text: string; error?: string }> {
  if (!res.body) return { text: '', error: 'Empty response body' };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let error: string | undefined;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]' || raw.length === 0) continue;
        const event = parseSseEvent(raw);
        if (!event) continue;
        if (event.type === 'text-delta' && typeof event.delta === 'string') {
          text += event.delta;
        } else if (event.type === 'error' && typeof event.errorText === 'string') {
          error = event.errorText;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { text, error };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
