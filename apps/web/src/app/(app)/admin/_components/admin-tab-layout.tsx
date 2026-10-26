'use client';

// SPDX-License-Identifier: Apache-2.0

// Admin console layout: the grouped section navigation and the active
// section panel.
//
// Sixteen sections used to sit in one `.no-scrollbar overflow-x-auto` strip,
// so on a 1280px viewport the last 7–8 tabs were clipped with no visual cue
// that they existed. They now render under four domain headings: a sticky left
// rail on `lg:` and a wrapped chip bar below it.
//
// Keyboard navigation still walks the flat `TABS` order (see `admin/page.tsx`)
// so the roving-tabindex contract is unchanged.
import { Suspense, type ComponentType, type KeyboardEvent, type RefObject } from 'react';

import { cn } from '@/lib/formatters/cn';

import { AdminTabFallback } from './admin-tab-fallback';
import { groupAdminTabs } from './admin-tab-groups';
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
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <div
        role="tablist"
        aria-label="Admin sections"
        className="flex flex-col gap-4 lg:sticky lg:top-4 lg:w-[220px] lg:shrink-0"
      >
        {groupAdminTabs(TABS).map(({ group, tabs }) => (
          <div key={group.id} role="presentation" className="flex flex-col gap-1.5">
            <p
              role="presentation"
              className="text-fg-subtle px-1 text-[10px] font-semibold tracking-wider uppercase"
            >
              {group.label}
            </p>
            <div role="presentation" className="flex flex-wrap gap-1 lg:flex-col lg:flex-nowrap">
              {tabs.map((tab) => {
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
                      'focus-visible:ring-brand/50 inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none',
                      active
                        ? 'surface-chip bg-bg-elev-2 text-brand border-brand/40 font-semibold shadow-xs'
                        : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2/60 border-transparent',
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <section
        id={`${activeTab}-panel`}
        role="tabpanel"
        aria-labelledby={`${activeTab}-tab`}
        tabIndex={0}
        className="focus-visible:ring-brand/50 min-h-[300px] min-w-0 flex-1 rounded-sm outline-none focus-visible:ring-2"
      >
        <Suspense fallback={<AdminTabFallback />}>
          <ActiveComponent />
        </Suspense>
      </section>
    </div>
  );
}
