'use client';

// SPDX-License-Identifier: Apache-2.0

// Admin console layout: the section tab strip and the active section panel.
import { Suspense, type ComponentType, type KeyboardEvent, type RefObject } from 'react';

import { cn } from '@/lib/formatters/cn';

import { AdminTabFallback } from './admin-tab-fallback';
import { TABS, type TabId } from './admin-tabs';

interface AdminTabLayoutProps {
  activeTab: TabId;
  tabRefs: RefObject<Record<TabId, HTMLButtonElement | null>>;
  onActivate: (tabId: TabId) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  ActiveComponent: ComponentType;
}

export function AdminTabLayout({
  activeTab,
  tabRefs,
  onActivate,
  onKeyDown,
  ActiveComponent,
}: AdminTabLayoutProps) {
  return (
    <div className="flex flex-col gap-6">
      <div aria-label="Admin sections" className="w-full" role="tablist">
        <div className="border-border no-scrollbar flex gap-1 overflow-x-auto border-b pb-3">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`${tab.id}-tab`}
                role="tab"
                aria-selected={active}
                {...(active ? { 'aria-controls': `${tab.id}-panel` } : {})}
                tabIndex={active ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                type="button"
                onClick={() => onActivate(tab.id)}
                onKeyDown={onKeyDown}
                className={cn(
                  'inline-flex min-h-10 items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                  'border-b-2',
                  active
                    ? 'border-brand text-brand'
                    : 'text-fg-muted hover:text-fg border-transparent',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <section
        id={`${activeTab}-panel`}
        role="tabpanel"
        aria-labelledby={`${activeTab}-tab`}
        tabIndex={0}
        className="focus-visible:ring-brand/50 min-h-[300px] rounded-sm outline-none focus-visible:ring-2"
      >
        <Suspense fallback={<AdminTabFallback />}>
          <ActiveComponent />
        </Suspense>
      </section>
    </div>
  );
}
