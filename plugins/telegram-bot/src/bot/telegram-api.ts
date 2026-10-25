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

// Thin grammY transport helpers shared by the webhook, jobs, tools and the
// alert channel. No business logic lives here.

import { Api, type InlineKeyboard } from 'grammy';

const SAFE_CHUNK_LENGTH = 4000;

export function telegramApi(botToken: string): Api {
  return new Api(botToken);
}

export function chunkTelegramText(text: string): string[] {
  if (text.length <= SAFE_CHUNK_LENGTH) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > SAFE_CHUNK_LENGTH) {
    const slice = remaining.slice(0, SAFE_CHUNK_LENGTH);
    const breakAt = Math.max(
      slice.lastIndexOf('\n\n'),
      slice.lastIndexOf('\n'),
      slice.lastIndexOf('. '),
    );
    const cut = breakAt > SAFE_CHUNK_LENGTH * 0.6 ? breakAt + 1 : SAFE_CHUNK_LENGTH;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

export async function sendTelegramText(
  botToken: string,
  chatId: string | number,
  text: string,
  options?: {
    keyboard?: InlineKeyboard;
    signal?: AbortSignal;
    disablePreview?: boolean;
  },
): Promise<void> {
  const api = telegramApi(botToken);
  const chunks = chunkTelegramText(text);
  for (let index = 0; index < chunks.length; index += 1) {
    await api.sendMessage(chatId, chunks[index]!, {
      ...(options?.disablePreview === false ? {} : { link_preview_options: { is_disabled: true } }),
      ...(index === 0 && options?.keyboard ? { reply_markup: options.keyboard } : {}),
      ...(options?.signal ? { signal: options.signal } : {}),
    });
  }
}

export async function sendTelegramTyping(botToken: string, chatId: string | number): Promise<void> {
  try {
    await telegramApi(botToken).sendChatAction(chatId, 'typing');
  } catch {
    // Best-effort UX only.
  }
}
