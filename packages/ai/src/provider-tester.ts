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

// SRP: Provider key testing (extracted from model.ts).
//
// Tests the validity of a provider API key by making an actual LLM call.
// Separated from model resolution so it can be unit-tested and imported
// without pulling in all of model.ts.

import { PROVIDER_IDS, type ProviderId } from '@kestrel/shared/encryption';
import { generateText } from 'ai';

import { BYOK_PROVIDERS } from './byok-providers';

/**
 * Strip a verbose AI SDK error down to the user-facing sentence.
 */
function extractErrorMessage(raw: string): string {
  const firstLine = raw.split('\n')[0]?.trim() ?? raw;
  return firstLine.replace(/\.+$/, '').slice(0, 160);
}

export interface ProviderValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validate provider key configuration before making network calls or saving keys.
 * Detects missing keys, length issues, invalid prefixes, or legacy Vertex service account JSON.
 */
export function validateProviderConfig(
  providerId: string,
  apiKey: string,
): ProviderValidationResult {
  if (providerId === 'vertex' || providerId === 'google-vertex') {
    return {
      ok: false,
      reason:
        'Google Vertex AI has been removed. Use direct Google Gemini (google) with an API key instead.',
    };
  }

  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return { ok: false, reason: 'API key is required' };
  }

  const trimmed = apiKey.trim();

  // Detect leftover Vertex or GCP service account JSON pasted by mistake
  if (
    trimmed.startsWith('{') &&
    (trimmed.includes('"type": "service_account"') ||
      trimmed.includes('client_email') ||
      trimmed.includes('"project_id"'))
  ) {
    return {
      ok: false,
      reason: 'GCP service account JSON is not supported. Please use a provider API key.',
    };
  }

  if (trimmed.length < 8) {
    return { ok: false, reason: 'API key is too short' };
  }

  if (!PROVIDER_IDS.includes(providerId as ProviderId)) {
    return { ok: false, reason: `Unknown provider: ${providerId}` };
  }

  // Common copy-paste errors across providers
  if (providerId === 'anthropic' && trimmed.startsWith('sk-proj-')) {
    return { ok: false, reason: 'Invalid key format: OpenAI project key provided for Anthropic' };
  }
  if (providerId === 'anthropic' && trimmed.startsWith('gsk_')) {
    return { ok: false, reason: 'Invalid key format: Groq key provided for Anthropic' };
  }
  if (providerId === 'openai' && trimmed.startsWith('sk-ant-')) {
    return { ok: false, reason: 'Invalid key format: Anthropic key provided for OpenAI' };
  }
  if (providerId === 'openai' && trimmed.startsWith('gsk_')) {
    return { ok: false, reason: 'Invalid key format: Groq key provided for OpenAI' };
  }
  if (providerId === 'groq' && !trimmed.startsWith('gsk_') && trimmed.startsWith('sk-ant-')) {
    return { ok: false, reason: 'Invalid key format for Groq (Anthropic key provided)' };
  }

  return { ok: true };
}

/**
 * Test the validity of a provider API key by instantiating a tiny request.
 * Returns null on success, an error message on failure.
 *
 * Used by the /api/settings/test-provider route to give the user feedback
 * without doing a full chat turn.
 */
export async function testProviderKey(
  providerId: ProviderId,
  apiKey: string,
): Promise<{ ok: true; rateLimit?: unknown } | { ok: false; error: string }> {
  const validation = validateProviderConfig(providerId, apiKey);
  if (!validation.ok) {
    return { ok: false, error: validation.reason ?? 'Invalid provider configuration' };
  }

  const spec = BYOK_PROVIDERS[providerId];
  if (!spec) return { ok: false, error: `Unknown provider: ${providerId}` };

  try {
    const builder = spec.factory(apiKey);
    const modelId = spec.defaultModels.fundamental;
    const model = builder(modelId);
    const signal = AbortSignal.timeout(5_000);
    await generateText({
      model,
      system: 'Respond with a single short confirmation.',
      prompt: 'ping',
      abortSignal: signal,
      maxOutputTokens: 1,
    });
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error
        ? (err as { statusCode?: number; responseBody?: string }).statusCode !== undefined
          ? `HTTP ${(err as { statusCode?: number }).statusCode} — ${extractErrorMessage(err.message)}`
          : extractErrorMessage(err.message)
        : String(err);
    return { ok: false, error: message };
  }
}
