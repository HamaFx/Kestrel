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
import React, { createContext, useCallback, useContext, useMemo } from 'react';

import { useLocalStorage } from '@/hooks/use-local-storage';

interface BookmarksState {
  bookmarks: string[];
  isBookmarked: (id: string) => boolean;
}

interface BookmarksActions {
  toggleBookmark: (id: string) => void;
}

const StateContext = createContext<BookmarksState | null>(null);
const ActionsContext = createContext<BookmarksActions | null>(null);

const STORAGE_KEY = 'kestrel:news:bookmarks';

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const [bookmarkIds, setBookmarkIds] = useLocalStorage<string[]>(STORAGE_KEY, []);

  const bookmarkSet = useMemo(() => new Set(bookmarkIds), [bookmarkIds]);

  const isBookmarked = useCallback((id: string) => bookmarkSet.has(id), [bookmarkSet]);

  const toggleBookmark = useCallback(
    (id: string) => {
      setBookmarkIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return [...next];
      });
    },
    [setBookmarkIds],
  );

  const state = useMemo(
    () => ({ bookmarks: bookmarkIds, isBookmarked }),
    [bookmarkIds, isBookmarked],
  );

  const actions = useMemo(() => ({ toggleBookmark }), [toggleBookmark]);

  return (
    <StateContext.Provider value={state}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </StateContext.Provider>
  );
}

function useBookmarksState(): BookmarksState {
  const context = useContext(StateContext);
  if (!context) {
    throw new Error('useBookmarksState must be used within a BookmarksProvider');
  }
  return context;
}

function useBookmarksActions(): BookmarksActions {
  const context = useContext(ActionsContext);
  if (!context) {
    throw new Error('useBookmarksActions must be used within a BookmarksProvider');
  }
  return context;
}

export function useBookmarksContext(): BookmarksState & BookmarksActions {
  return { ...useBookmarksState(), ...useBookmarksActions() };
}
