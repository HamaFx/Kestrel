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
import { IconCpu, IconKey, IconRobot } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

const AI_TABS = [
  { href: '/settings/api-keys', label: 'API Keys & Health', shortLabel: 'API Keys', icon: IconKey },
  { href: '/settings/models', label: 'Models & Routing', shortLabel: 'Models', icon: IconCpu },
  { href: '/settings/agent', label: 'Agent Tools & Overrides', shortLabel: 'Agent Tools', icon: IconRobot },
];

export function AISubNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="AI & Intelligence Sections"
      className="surface-well flex flex-row gap-1 overflow-x-auto rounded-xl border border-white/5 p-1 scrollbar-none"
    >
      {AI_TABS.map((tab) => {
        const active = pathname === tab.href;
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all tactile-press active:translate-y-[0.5px]',
              active
                ? 'surface-chip bg-bg-elev-2 text-fg shadow-xs font-semibold'
                : 'text-fg-subtle hover:text-fg hover:bg-bg-elev-1/50',
            )}
          >
            <Icon className={cn('size-4 shrink-0', active ? 'text-brand' : 'text-fg-subtle')} />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
