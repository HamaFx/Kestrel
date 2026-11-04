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
//
// R10 (audit 2026-10-31) — grammY's default request timeout is 500s, which is
// longer than the worker's entire 120s alert job, and the abort signal is a
// separate argument of every `Api` method (passing it inside the payload
// object throws at runtime: "Incorrect abort signal instance found!"). Every
// send made through here is now bounded twice: by the client's own
// `timeoutSeconds` and by a per-send `AbortSignal` that also carries the
// caller's cancellation.

import { Api, type InlineKeyboard } from 'grammy';

const SAFE_CHUNK_LENGTH = 4000;

/** Wall clock for one logical send (all chunks of one message). */
const TELEGRAM_SEND_TIMEOUT_MS = 15_000;
/** `sendChatAction` is decorative; never let it hold a reply back. */
const TELEGRAM_TYPING_TIMEOUT_MS = 5_000;

/**
 * grammY types its signal parameter as `abort-controller`'s `AbortSignal`
 * (see `grammy/out/shim.node.d.ts`), while the runtime only checks for an
 * `addEventListener` method, so a native `AbortSignal` works and needs this
 * one cast.
 */
type GrammyAbortSignal = Parameters<Api['sendMessage']>[3];
function asGrammySignal(signal: AbortSignal): GrammyAbortSignal {
  return signal as unknown as GrammyAbortSignal;
}

export function telegramApi(botToken: string, timeoutMs: number = TELEGRAM_SEND_TIMEOUT_MS): Api {
  // grammY's default is 500s. Bound it here so even a call site that forgets
  // the signal argument cannot hold the event loop for minutes.
  return new Api(botToken, {
    timeoutSeconds: Math.max(1, Math.ceil(timeoutMs / 1000)),
  });
}

/** Bound a send: the caller's signal plus a hard timeout. */
function telegramSendSignal(
  signal?: AbortSignal | undefined,
  timeoutMs: number = TELEGRAM_SEND_TIMEOUT_MS,
): AbortSignal {
  const timeout = AbortSignal.timeout(Math.max(1, timeoutMs));
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function chunkTelegramText(text: string): string[] {
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
    /** Override the per-send wall clock (ms). */
    timeoutMs?: number;
  },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? TELEGRAM_SEND_TIMEOUT_MS;
  const api = telegramApi(botToken, timeoutMs);
  const chunks = chunkTelegramText(text);
  // One budget for the whole message: a long message must not reset the clock
  // for every chunk.
  const signal = asGrammySignal(telegramSendSignal(options?.signal, timeoutMs));
  for (let index = 0; index < chunks.length; index += 1) {
    await api.sendMessage(
      chatId,
      chunks[index]!,
      {
        ...(options?.disablePreview === false
          ? {}
          : { link_preview_options: { is_disabled: true } }),
        ...(index === 0 && options?.keyboard ? { reply_markup: options.keyboard } : {}),
      },
      signal,
    );
  }
}

export async function sendTelegramTyping(botToken: string, chatId: string | number): Promise<void> {
  try {
    await telegramApi(botToken, TELEGRAM_TYPING_TIMEOUT_MS).sendChatAction(
      chatId,
      'typing',
      {},
      asGrammySignal(AbortSignal.timeout(TELEGRAM_TYPING_TIMEOUT_MS)),
    );
  } catch {
    // Best-effort UX only.
  }
}

/**
 * Dismiss a callback button, bounded — Telegram shows a spinner until this
 * lands. `text` becomes the toast shown above the chat.
 */
export async function answerTelegramCallback(
  botToken: string,
  callbackQueryId: string,
  signal?: AbortSignal | undefined,
  text?: string,
): Promise<void> {
  try {
    await telegramApi(botToken, TELEGRAM_TYPING_TIMEOUT_MS).answerCallbackQuery(
      callbackQueryId,
      text ? { text } : {},
      asGrammySignal(telegramSendSignal(signal, TELEGRAM_TYPING_TIMEOUT_MS)),
    );
  } catch {
    // Best-effort UX only.
  }
}
