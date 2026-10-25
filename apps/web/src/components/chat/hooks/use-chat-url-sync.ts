'use client';

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

// Thread summary fetch (lazy, only after a conversation grows).
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/http/api-client';

export interface ThreadSummaryState {
  synopsis: string;
  insights: Array<{ text: string; symbol?: string | null }>;
}

export function useChatUrlSync({
  threadId,
  messageCount,
}: {
  threadId: string;
  messageCount: number;
}) {
  const [summary, setSummary] = useState<ThreadSummaryState | null>(null);

  useEffect(() => {
    if (messageCount <= 20 || summary) return;
    const ac = new AbortController();
    apiFetch<ThreadSummaryState>(`/api/chat/threads/${threadId}/summary`, {
      signal: ac.signal,
    })
      .then((data) => {
        if (data && typeof data.synopsis === 'string') setSummary(data);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      });
    return () => ac.abort();
  }, [messageCount, threadId, summary]);

  return { summary, setSummary };
}
