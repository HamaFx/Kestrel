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

// Client-side fetch helpers for plugin UI packages.
//
// Plugin UI bundles cannot import the web app's `@/` aliases, so the CSRF
// cookie handling and the plugin API error envelope are shared here instead of
// being copy-pasted into every `ui/api.ts`.

const CSRF_COOKIE_NAMES = [
  '__Host-kestrel_csrf',
  'kestrel_csrf',
  '__Host-hfx_csrf',
  'hfx_csrf',
] as const;

/** CSRF token from the request proxy's cookie, or undefined on the server. */
export function readCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const name of CSRF_COOKIE_NAMES) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    if (match?.[1] !== undefined) return decodeURIComponent(match[1]);
  }
  return undefined;
}

/** Message from the plugin API's error envelope, or a plain HTTP status. */
export function extractPluginErrorMessage(payload: unknown, status: number): string {
  const message = (payload as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === 'string' && message.length > 0 ? message : `HTTP ${status}`;
}

/** Normalise an unknown thrown value to a user-facing message. */
export function pluginErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface PluginFetcher {
  <T>(path: string, init?: RequestInit): Promise<T>;
  /** POST a multipart `FormData` body (uploads) with the CSRF header. */
  upload<T>(path: string, form: FormData): Promise<T>;
}

/** JSON (+ multipart upload) fetcher scoped to `/api/plugins/<pluginId>`. */
export function createPluginFetcher(pluginId: string): PluginFetcher {
  async function send<T>(path: string, init: RequestInit, jsonBody: boolean): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    const token = readCsrfToken();
    if (token) headers.set('X-CSRF-Token', token);
    if (jsonBody && init.body) headers.set('content-type', 'application/json');

    const response = await fetch(`/api/plugins/${pluginId}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(extractPluginErrorMessage(body, response.status));
    return body as T;
  }

  const fetcher = <T>(path: string, init?: RequestInit): Promise<T> =>
    send<T>(path, init ?? {}, true);
  return Object.assign(fetcher, {
    upload: <T>(path: string, form: FormData): Promise<T> =>
      send<T>(path, { method: 'POST', body: form }, false),
  });
}
