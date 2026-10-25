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

// The HCNSEC-only fetch wrapper: buffer tool-call responses (bounded),
// normalize them, and leave plain text streams on their native path.

import type { FetchFunction } from '@ai-sdk/provider-utils';

import { normalizeHcnsecJsonPayload } from './json-payload';
import { normalizeHcnsecSse } from './sse';

const HCNSEC_MAX_RESPONSE_BYTES = 2_000_000;

/**
 * Fetch wrapper used only by HCNSEC. Tool-call responses are normalized
 * after buffering; plain text streams retain their native low-latency path.
 */
export const hcnsecFetch: FetchFunction = async (input, init) => {
  const body =
    typeof init?.body === 'string'
      ? (() => {
          try {
            return JSON.parse(init.body) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : null;
  const hasTools = Array.isArray(body?.tools) && body.tools.length > 0;
  const response = await fetch(input, init);
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!response.ok || !hasTools || !response.body) return response;

  if (contentType.includes('text/event-stream')) {
    const raw = await readBoundedResponseText(response);
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    return new Response(normalizeHcnsecSse(raw), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  if (contentType.includes('application/json')) {
    const raw = await readBoundedResponseText(response);
    try {
      const normalized = normalizeHcnsecJsonPayload(JSON.parse(raw) as unknown);
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      return new Response(JSON.stringify(normalized), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return new Response(raw, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
  }

  return response;
};

async function readBoundedResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > HCNSEC_MAX_RESPONSE_BYTES) {
    throw new Error(`HCNSEC response exceeds ${HCNSEC_MAX_RESPONSE_BYTES} bytes`);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > HCNSEC_MAX_RESPONSE_BYTES) {
        await reader.cancel('response too large');
        throw new Error(`HCNSEC response exceeds ${HCNSEC_MAX_RESPONSE_BYTES} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder().decode(concatBytes(chunks, total));
}

function concatBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
