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

// Bounded HTTP for the fixed provider endpoints. URL validation lives here so
// no future caller can turn this helper into an unrestricted remote fetch.

import { assertSafeOutboundUrl } from '@kestrel/shared';

const MAX_PROVIDER_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * Fetch provider JSON with bounded response buffering. Provider endpoints are
 * fixed, but keeping URL validation here prevents future callers from turning
 * this helper into an unrestricted remote-fetch primitive.
 */
export async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<Record<string, unknown>> {
  assertAllowedProviderUrl(url);
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) abortFromParent();
    else parentSignal.addEventListener('abort', abortFromParent, { once: true });
  }
  const timeout = setTimeout(
    () => controller.abort(new Error(`web search timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  try {
    const response = await fetch(url, {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    });
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_RESPONSE_BYTES) {
      throw new Error('provider response exceeded the 2 MiB safety limit');
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            total += value.byteLength;
            if (total > MAX_PROVIDER_RESPONSE_BYTES) {
              await reader.cancel().catch(() => undefined);
              throw new Error('provider response exceeded the 2 MiB safety limit');
            }
            chunks.push(value);
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
    const body = new TextDecoder().decode(concatBytes(chunks, total));
    if (!response.ok) {
      throw new Error(`provider returned HTTP ${response.status}`);
    }
    let parsed: unknown = {};
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      throw new Error('provider returned invalid JSON');
    }
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

function assertAllowedProviderUrl(value: string): void {
  const url = assertSafeOutboundUrl(value, {
    protocols: ['https:'],
    hosts: ['api.exa.ai', 'api.tavily.com', 'api.search.brave.com'],
  });
  if (url.protocol !== 'https:') {
    throw new Error('web search provider URL must use HTTPS');
  }
  const allowedHosts = new Set(['api.exa.ai', 'api.tavily.com', 'api.search.brave.com']);
  if (!allowedHosts.has(url.hostname)) {
    throw new Error('web search provider URL is not allowlisted');
  }
  if (url.username || url.password) {
    throw new Error('web search provider URL must not contain credentials');
  }
}

export function isAllowedWebSearchProviderUrl(value: string): boolean {
  try {
    assertAllowedProviderUrl(value);
    return true;
  } catch {
    return false;
  }
}

function concatBytes(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
