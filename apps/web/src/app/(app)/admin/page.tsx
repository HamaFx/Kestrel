'use client';

// SPDX-License-Identifier: Apache-2.0

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

// Admin console route: resolves the active section from the `tab` query param
// and renders the section layout.
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, type KeyboardEvent } from 'react';

import { AdminTabLayout } from './_components/admin-tab-layout';
import { DEFAULT_TAB, isValidTab, TAB_PARAM, TABS, type TabId } from './_components/admin-tabs';

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get(TAB_PARAM);
  const activeTab: TabId = isValidTab(rawTab) ? rawTab : DEFAULT_TAB;

  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>(
    {} as Record<TabId, HTMLButtonElement | null>,
  );

  useEffect(() => {
    if (rawTab !== null && !isValidTab(rawTab)) {
      router.replace('/admin', { scroll: false });
      return;
    }

    if (rawTab !== 'traces' && searchParams.get('trace')) {
      const params = new URLSearchParams(window.location.search);
      params.delete('trace');
      const qs = params.toString();
      router.replace(`/admin${qs ? `?${qs}` : ''}`, { scroll: false });
    }
  }, [rawTab, router, searchParams]);

  const updateUrl = useCallback(
    (tabId: TabId) => {
      const params = new URLSearchParams(window.location.search);
      if (tabId === DEFAULT_TAB) {
        params.delete(TAB_PARAM);
      } else {
        params.set(TAB_PARAM, tabId);
      }
      if (tabId !== 'traces') {
        params.delete('trace');
      }
      const qs = params.toString();
      router.replace(`/admin${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router],
  );

  const activateTab = useCallback(
    (tabId: TabId) => {
      if (tabId === activeTab) return;
      updateUrl(tabId);
    },
    [activeTab, updateUrl],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = TABS.findIndex((t) => t.id === activeTab);
      let nextIndex: number;

      switch (event.key) {
        case 'ArrowRight':
          nextIndex = (currentIndex + 1) % TABS.length;
          break;
        case 'ArrowLeft':
          nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = TABS.length - 1;
          break;
        case 'ArrowDown':
          event.preventDefault();
          document.getElementById(`${activeTab}-panel`)?.focus();
          return;
        default:
          return;
      }

      event.preventDefault();
      const nextTab = TABS[nextIndex];
      if (!nextTab) return;
      updateUrl(nextTab.id);
      tabRefs.current[nextTab.id]?.focus();
    },
    [activeTab, updateUrl],
  );

  const tab = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const ActiveComponent = tab.Component;

  return (
    <AdminTabLayout
      activeTab={activeTab}
      tabRefs={tabRefs}
      onActivate={activateTab}
      onKeyDown={handleKeyDown}
      ActiveComponent={ActiveComponent}
    />
  );
}
