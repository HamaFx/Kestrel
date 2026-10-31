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

import { createPluginFetcher } from '@kestrel/plugin-sdk/ui';
import { useCallback, useEffect, useState } from 'react';

const pluginFetch = createPluginFetcher('telegram-bot');

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
