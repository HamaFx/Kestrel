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

// (R7, follow-up) — the ONE place that turns a Kestrel
// chat-image reference into bytes for a model provider.
//
// Resolution has to happen here, at the final provider conversion, because
// every earlier stage persists what it is given:
//
//   - Drizzle `chat_messages.parts` is written by appendUserMessage.
//   - Mastra's memory saves input messages it is handed (`MessageList` drains
//     them as new user messages), and its thread storage is durable.
//   - Mastra's own pre-flight asset downloader fetches URL parts before the
//     model call and records failures on the message.
//
// So call sites keep the reference (proxy path/URL, legacy Supabase URL) and
// this middleware produces the provider's inline part. Two cooperating hooks:
//
//   overrideSupportedUrls — declares Kestrel image URL shapes as "supported",
//     which makes Mastra's pre-flight downloader hand them through to the
//     provider prompt instead of fetching (and failing) anonymously. Without
//     this, Mastra would replace the attachment with an "unavailable"
//     placeholder before the middleware ever sees it.
//   transformParams — downloads the bytes with the service-role key via the
//     shared resolver and replaces the URL part with inline data, or with the
//     honest "could not be loaded" text note. Nothing is written back to any
//     store: this operates on the provider prompt only.

import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from 'ai';

import {
  CHAT_IMAGE_UNAVAILABLE_TEXT,
  createImageResolutionCache,
  resolveImageReference,
  type ResolveImagePartOptions,
} from './resolve-image-part';

/**
 * URL shapes the middleware claims (proxy uploads and legacy/authenticated
 * Supabase object URLs for the `chat-images` bucket). Kept in lockstep with
 * `chat-image-object-path.ts`.
 */
const KESTREL_IMAGE_URL_PATTERNS: readonly RegExp[] = [
  /\/api\/uploads\//,
  /\/storage\/v1\/object\/(?:public|authenticated|sign)\/chat-images\//,
];

/** True when a URL string has one of the Kestrel chat-image shapes. */
function isKestrelImageUrlShape(value: string): boolean {
  return KESTREL_IMAGE_URL_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Model middleware that inlines Kestrel-owned chat images at the provider
 * boundary. The cache dedupes repeated references across the steps of one
 * model instance (multi-step tool loops, committee agents).
 */
function createImageResolutionMiddleware(
  options: ResolveImagePartOptions = {},
): LanguageModelMiddleware {
  const cache = options.cache ?? createImageResolutionCache();
  const resolveOptions: ResolveImagePartOptions = { ...options, cache };

  return {
    specificationVersion: 'v4',
    overrideSupportedUrls: async ({ model }) => {
      // Merge the provider's native URL support so nothing regresses for
      // URLs the provider itself can fetch; the Kestrel patterns are added.
      const existing = (await model.supportedUrls) ?? {};
      const merged: Record<string, RegExp[]> = { ...existing };
      for (const key of ['image/*', 'image']) {
        merged[key] = [...(existing[key] ?? []), ...KESTREL_IMAGE_URL_PATTERNS];
      }
      return merged;
    },
    transformParams: async ({ params }) => {
      if (!promptMentionsKestrelImage(params.prompt)) return params;
      const prompt = await resolvePromptImages(params.prompt, resolveOptions);
      return { ...params, prompt } as typeof params;
    },
  };
}

/**
 * Wrap one language model with the image-resolution middleware. Strings
 * (gateway model ids) cannot be wrapped and pass through unchanged.
 */
export function withImageResolution<M extends LanguageModel | string>(
  model: M,
  options: ResolveImagePartOptions = {},
): M {
  if (typeof model !== 'object' || model === null) return model;
  const candidate = model as { doGenerate?: unknown; doStream?: unknown };
  if (typeof candidate.doGenerate !== 'function' && typeof candidate.doStream !== 'function') {
    return model;
  }
  return wrapLanguageModel({
    model: model as never,
    middleware: createImageResolutionMiddleware(options),
  }) as M;
}

function promptMentionsKestrelImage(prompt: unknown): boolean {
  if (!Array.isArray(prompt)) return false;
  for (const message of prompt) {
    if (!isRecord(message) || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (!isRecord(part)) continue;
      if (part.type === 'file') {
        const reference = referenceFromFileData(part.data);
        if (reference !== null && isKestrelImageUrlShape(reference)) return true;
      }
      if (
        part.type === 'tool-result' &&
        isRecord(part.output) &&
        part.output.type === 'content' &&
        Array.isArray(part.output.value)
      ) {
        for (const nested of part.output.value) {
          if (!isRecord(nested) || nested.type !== 'file') continue;
          const reference = referenceFromFileData(nested.data);
          if (reference !== null && isKestrelImageUrlShape(reference)) return true;
        }
      }
    }
  }
  return false;
}

async function resolvePromptImages(
  prompt: unknown,
  options: ResolveImagePartOptions,
): Promise<unknown> {
  if (!Array.isArray(prompt)) return prompt;
  const messages: unknown[] = [];
  for (const message of prompt) {
    messages.push(await resolveMessageImages(message, options));
  }
  return messages;
}

async function resolveMessageImages(
  message: unknown,
  options: ResolveImagePartOptions,
): Promise<unknown> {
  if (!isRecord(message) || !Array.isArray(message.content)) return message;

  const content: unknown[] = [];
  let changed = false;
  for (const part of message.content) {
    if (
      isRecord(part) &&
      part.type === 'tool-result' &&
      isRecord(part.output) &&
      part.output.type === 'content' &&
      Array.isArray(part.output.value)
    ) {
      const value: unknown[] = [];
      let nestedChanged = false;
      for (const nested of part.output.value) {
        const resolved = await resolveContentPart(nested, options);
        if (resolved !== nested) nestedChanged = true;
        value.push(resolved);
      }
      if (nestedChanged) {
        content.push({ ...part, output: { ...part.output, value } });
        changed = true;
      } else {
        content.push(part);
      }
      continue;
    }

    const resolved = await resolveContentPart(part, options);
    if (resolved !== part) changed = true;
    content.push(resolved);
  }

  return changed ? { ...message, content } : message;
}

async function resolveContentPart(
  part: unknown,
  options: ResolveImagePartOptions,
): Promise<unknown> {
  if (!isRecord(part) || part.type !== 'file') return part;

  const reference = referenceFromFileData(part.data);
  if (reference === null) return part;

  const resolution = await resolveImageReference(reference, options);
  if (resolution.kind === 'passthrough') return part;
  if (resolution.kind === 'unavailable') {
    return { type: 'text', text: CHAT_IMAGE_UNAVAILABLE_TEXT };
  }

  return {
    type: 'file',
    mediaType: resolution.mediaType,
    ...(typeof part.filename === 'string' ? { filename: part.filename } : {}),
    data: { type: 'data', data: resolution.base64 },
    ...(isRecord(part.providerOptions) ? { providerOptions: part.providerOptions } : {}),
  };
}

/** Extract a reference string from a provider-prompt file part's data. */
function referenceFromFileData(data: unknown): string | null {
  if (data instanceof URL) return data.toString();
  if (typeof data === 'string') {
    const trimmed = data.trim();
    // A bare URL string (some callers pass `{ type: 'file', data: url }`).
    // Raw base64 has no scheme and is left to the provider untouched.
    if (/^(?:https?|data|blob):/i.test(trimmed)) return trimmed;
    return null;
  }
  if (isRecord(data)) {
    if (data.url instanceof URL) return data.url.toString();
    if (typeof data.url === 'string') return data.url;
    if (typeof data.originalUrl === 'string') return data.originalUrl;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
