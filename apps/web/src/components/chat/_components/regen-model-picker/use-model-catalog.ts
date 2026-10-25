'use client';

// SPDX-License-Identifier: Apache-2.0

// Lazy catalog fetch for the regenerate model picker, with a 1-minute
// module-level cache and stale-while-revalidate behaviour.
import type { CatalogResponse } from '@kestrel/shared';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/http/api-client';

interface CacheData {
  catalog: CatalogResponse | null;
  chatModel: string | null;
  fetchedAt: number;
}

let moduleCache: CacheData | null = null;
const CACHE_TTL_MS = 60000; // 1 minute

export function useModelCatalog() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [chatModel, setChatModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // We re-fetch on every mount (popover-open). The catalog endpoint
  // is `force-dynamic` so it always reflects the current saved keys.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const now = Date.now();

      // If we have cache and it's not stale, use it and finish
      if (moduleCache && now - moduleCache.fetchedAt < CACHE_TTL_MS) {
        setCatalog(moduleCache.catalog);
        setChatModel(moduleCache.chatModel);
        setLoading(false);
        return;
      }

      // If we have a stale cache, show it immediately (stale-while-revalidate)
      if (moduleCache) {
        setCatalog(moduleCache.catalog);
        setChatModel(moduleCache.chatModel);
        setLoading(false);
      }

      try {
        const [catData, modelData] = await Promise.all([
          apiFetch<CatalogResponse>('/api/settings/catalog', { cache: 'no-store' }),
          apiFetch<{ chatModel: string | null }>('/api/settings/chat-model', { cache: 'no-store' }),
        ]);
        if (cancelled) return;

        setCatalog(catData);
        setChatModel(modelData.chatModel);

        moduleCache = {
          catalog: catData,
          chatModel: modelData.chatModel,
          fetchedAt: Date.now(),
        };
      } catch (err) {
        console.error('Error fetching model picker data', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { catalog, chatModel, loading };
}
