// SPDX-License-Identifier: Apache-2.0

// Local-storage usage counters for the data & cache card: how many saved
// article bookmarks exist and how many `kestrel:` keys live on this device.

import { useCallback, useEffect, useState } from 'react';

import { migrateLegacyStorageNamespace } from '@/lib/http/storage';

export const KEY_BOOKMARKS = 'kestrel:news:bookmarks';
export const KEY_PREFS = 'kestrel:prefs:v1';

export interface Counts {
  bookmarks: number;
  storage: number;
}

function readCounts(): Counts {
  if (typeof window === 'undefined') return { bookmarks: 0, storage: 0 };
  migrateLegacyStorageNamespace();
  let bookmarks = 0;
  let storage = 0;
  try {
    const raw = window.localStorage.getItem(KEY_BOOKMARKS);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) bookmarks = parsed.length;
    }
  } catch {
    console.error('[settings] failed to parse bookmarks from localStorage');
  }
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith('kestrel:')) storage += 1;
  }
  return { bookmarks, storage };
}

export function useDataUsage() {
  const [counts, setCounts] = useState<Counts>({ bookmarks: 0, storage: 0 });

  useEffect(() => {
    setCounts(readCounts());
    function onStorage(e: StorageEvent) {
      if (!e.key || e.key.startsWith('kestrel:')) setCounts(readCounts());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const refresh = useCallback(() => setCounts(readCounts()), []);

  return { counts, refresh };
}
