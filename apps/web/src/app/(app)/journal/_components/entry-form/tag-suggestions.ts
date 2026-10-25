// SPDX-License-Identifier: Apache-2.0

// Tag suggestions for the entry form, derived from previously logged entries.
import { JournalEntrySchema, type JournalEntry } from '@kestrel/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { apiFetch } from '@/lib/http/api-client';

export function useTagSuggestions() {
  const { data: allEntries } = useQuery<JournalEntry[]>({
    queryKey: ['journal', 'all-tags'],
    queryFn: async () => {
      try {
        const data = await apiFetch<{ entries: unknown[] }>('/api/journal?limit=500');
        return data.entries
          .map((e) => {
            const parsed = JournalEntrySchema.safeParse(e);
            return parsed.success ? parsed.data : null;
          })
          .filter((e): e is JournalEntry => e !== null);
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  return useMemo(() => {
    const set = new Set<string>();
    allEntries?.forEach((e) => e.tags?.forEach((t: string) => set.add(t)));
    return Array.from(set).sort();
  }, [allEntries]);
}
