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

// Data + actions for the Telegram Copilot page.
//
// The plugin UI package cannot import the web app's `@/` aliases, so it talks
// to its own authenticated plugin API routes. Keeping the state outside the
// page shell lets the layout stay a thin presentational component.

import { useCallback, useEffect, useState } from 'react';

const PLUGIN_ID = 'telegram-bot';

export interface StatusResponse {
  installed: boolean;
  connected: boolean;
  botUsername: string | null;
  linked: { chatId: string; linkedAt: string | null } | null;
  webhook: {
    configured: boolean;
    url?: string;
    pendingUpdateCount?: number;
    lastErrorMessage?: string;
  };
  settings: {
    alertsEnabled: boolean;
    briefingEnabled: boolean;
    briefingTime: string;
    timezone: string;
    briefingIncludePositions: boolean;
    lastError: string | null;
  };
}

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const name of ['__Host-hfx_csrf', 'hfx_csrf']) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    if (match?.[1] !== undefined) return decodeURIComponent(match[1]);
  }
  return undefined;
}

async function pluginFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');
  const token = csrfToken();
  if (token) headers.set('X-CSRF-Token', token);
  if (init?.body) headers.set('content-type', 'application/json');

  const response = await fetch(`/api/plugins/${PLUGIN_ID}${path}`, { ...init, headers });
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
  }
  return body as T;
}

export function useTelegramPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await pluginFetch<StatusResponse>('/status');
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Telegram status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (label: string, work: () => Promise<void>) => {
      setBusy(label);
      try {
        await work();
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed');
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const unlink = useCallback(
    () =>
      run('unlink', async () => {
        await pluginFetch('/unlink', { method: 'POST', body: '{}' });
      }),
    [run],
  );

  const sendTest = useCallback(
    () =>
      run('test', async () => {
        await pluginFetch('/test-message', { method: 'POST', body: '{}' });
      }),
    [run],
  );

  return { status, loading, busy, error, load, unlink, sendTest };
}
