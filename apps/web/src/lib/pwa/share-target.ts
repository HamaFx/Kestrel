// SPDX-License-Identifier: Apache-2.0
//
// Web Share Target payload handling.
//
// The manifest registers `/share/receive` as a GET share target, so another app
// on the device can hand Kestrel a `title` / `text` / `url` triple
// (`SHARE_TARGET_ACTION`). This module turns that untrusted payload into a chat
// prompt: the values come from outside the app, they can be arbitrarily long,
// and they end up inside a URL — so the whole conversion is a pure function that
// the tests can hammer.
//
// The prompt shape mirrors the app's other "Ask AI" affordances:
//
//   What does this mean for my trading?
//
//   Title: …
//   Shared: …
//   https://…

/** Where the manifest sends shares. Mirrored in `src/app/manifest.ts`. */
export const SHARE_TARGET_ACTION = '/share/receive';

/** Field names the manifest maps onto query params. */
export const SHARE_TARGET_PARAMS = {
  title: 'title',
  text: 'text',
  url: 'url',
} as const;

const MAX_TITLE = 200;
const MAX_TEXT = 4_000;
const MAX_URL = 2_048;

/**
 * Budget for the *percent-encoded* prompt in `?prompt=`.
 *
 * `/share/receive` redirects to `/chat?prompt=…`, and the chat landing page
 * redirects once more with the prompt attached. Every hop carries the value in
 * a URL, so the encoded size — not the character count — is what can overflow a
 * proxy header limit (CJK and emoji encode to 9 bytes per byte of UTF-8).
 */
export const MAX_ENCODED_PROMPT = 3_000;

export interface SharePayload {
  title?: string | string[];
  text?: string | string[];
  url?: string | string[];
}

export interface ShareIntent {
  /** Message the chat surface will send on the user's behalf. */
  prompt: string;
  /** Cleaned title, for the receiver's own copy (null when absent). */
  title: string | null;
}

/** Query params can arrive repeated; take the first value. */
function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Characters that must never reach a prompt: C0 controls (minus tab/newline/
 * carriage return, which the whitespace pass handles), DEL and the C1 block,
 * and the bidi embedding/override/isolate ranges, which can reorder visible
 * text. Expressed as code-point checks rather than a regex because ESLint's
 * `no-control-regex` would otherwise need a disable comment that Prettier's
 * line wrapping keeps detaching from the literal.
 */
function isUnsafeCodePoint(code: number): boolean {
  if (code <= 0x08) return true;
  if (code === 0x0b || code === 0x0c) return true;
  if (code >= 0x0e && code <= 0x1f) return true;
  if (code >= 0x7f && code <= 0x9f) return true;
  if (code >= 0x202a && code <= 0x202e) return true;
  return code >= 0x2066 && code <= 0x2069;
}

/**
 * Strip control characters, collapse runs of whitespace, and cap the length.
 */
function clean(value: string | undefined, max: number): string {
  if (!value) return '';
  // Bound the scan before doing any work: a share payload can be megabytes, and
  // collapsing whitespace can only make a string shorter, so a prefix of
  // `max * 4` characters is more than enough to produce the first `max` of the
  // result.
  const bounded = value.slice(0, safeCut(value, max * 4));
  const withoutControls = Array.from(bounded, (character) =>
    isUnsafeCodePoint(character.codePointAt(0) ?? 0) ? ' ' : character,
  )
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return truncate(withoutControls, max);
}

/** `index`, stepped back one when it would split a surrogate pair. */
function safeCut(value: string, index: number): number {
  return isHighSurrogate(value.charCodeAt(index - 1)) ? index - 1 : index;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  // Never split a surrogate pair (an emoji would become a lone surrogate and
  // the encoded URL would contain a broken sequence).
  return `${value.slice(0, safeCut(value, max)).trimEnd()}…`;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** Keep only absolute http(s) URLs — never `javascript:`, `data:` or `file:`. */
function sanitizeUrl(value: string | undefined): string | null {
  const raw = clean(value, MAX_URL);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href.slice(0, MAX_URL);
  } catch {
    return null;
  }
}

/** Percent-encoded length of the truncation marker ("%E2%80%A6" is 9 chars). */
const ELLIPSIS_ENCODED_LENGTH = encodeURIComponent('…').length;

/**
 * Shrink `value` until its percent-encoded form fits `maxEncoded`, keeping the
 * string valid UTF-16 (never splitting a surrogate pair).
 */
export function fitToEncodedBudget(value: string, maxEncoded = MAX_ENCODED_PROMPT): string {
  if (encodeURIComponent(value).length <= maxEncoded) return value;
  if (maxEncoded < ELLIPSIS_ENCODED_LENGTH) return '';

  // Reserve the encoded cost of the ellipsis we append below — it is nine
  // characters in a query string, not one.
  const budget = maxEncoded - ELLIPSIS_ENCODED_LENGTH;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = value.slice(0, safeCut(value, mid));
    if (encodeURIComponent(candidate).length <= budget) low = mid;
    else high = mid - 1;
  }

  return `${value.slice(0, safeCut(value, low)).trimEnd()}…`;
}

/** Build the chat prompt from a share payload; null when there is nothing to share. */
export function buildShareIntent(payload: SharePayload): ShareIntent | null {
  const title = clean(first(payload.title), MAX_TITLE);
  const text = clean(first(payload.text), MAX_TEXT);
  const url = sanitizeUrl(first(payload.url));

  if (!title && !text && !url) return null;

  const lines = ['What does this mean for my trading?', ''];
  if (title) lines.push(`Title: ${title}`);
  if (text) lines.push(`Shared: ${text}`);
  if (url) lines.push(url);

  return {
    prompt: fitToEncodedBudget(lines.join('\n')),
    title: title || null,
  };
}
