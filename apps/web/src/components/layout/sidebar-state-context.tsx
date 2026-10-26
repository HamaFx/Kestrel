// SPDX-License-Identifier: Apache-2.0

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
import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';

import { useLocalStorage } from '@/hooks/use-local-storage';

interface SidebarStateContextValue {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  toggle: () => void;
}

const SidebarStateContext = createContext<SidebarStateContextValue | null>(null);

const SIDEBAR_STORAGE_KEY = 'kestrel:sidebar-collapsed:v1';

export function SidebarStateProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(SIDEBAR_STORAGE_KEY, false);

  const toggle = useCallback(() => {
    setCollapsed((v) => !v);
  }, [setCollapsed]);

  // Global standard ⌘B / Ctrl+B shortcut to toggle sidebar collapse
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        toggle();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  return (
    <SidebarStateContext.Provider value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </SidebarStateContext.Provider>
  );
}

const defaultSidebarState: SidebarStateContextValue = {
  collapsed: true,
  setCollapsed: () => {},
  toggle: () => {},
};

export function useSidebarState() {
  const ctx = useContext(SidebarStateContext);
  return ctx ?? defaultSidebarState;
}
