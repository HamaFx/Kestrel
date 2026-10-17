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

// Top app bar — sticky surface with three slots:
//   [☰ menu] [brand mark + title] [right slot]
//
// The chat route renders its own <ChatTopBar>; we hide the global TopBar
// there so we don't have two stacked headers (and so the global TopBar
// doesn't catch focus or pointer events meant for the chat surface).
//
// usePathname makes this a client component, but the cost is one
// useState read per navigation — negligible, and well worth the
// simplicity vs. a route-group restructure.
import { usePathname } from 'next/navigation';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { cn } from '@/lib/cn';

import { NavTrigger } from './nav-trigger';

interface TopBarProps {
  title?: string;
  /**
   * Optional right-aligned slot — pass icons/buttons that vary per page.
   */
  right?: React.ReactNode;
}

export function TopBar({ title, right }: TopBarProps) {
  const pathname = usePathname() ?? '';

  // Chat brings its own top bar (ChatTopBar). Returning null here is the
  // simplest way to suppress the global one without restructuring routes.
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return null;

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-[calc(3rem+env(safe-area-inset-top,0px))] min-h-12 w-full items-center justify-between',
        'border-border/80 bg-bg/95 pt-safe border-b px-3.5 backdrop-blur-md shadow-[0_1px_0_rgba(255,255,255,0.03)]',
      )}
    >
      <div className="flex items-center gap-2">
        <NavTrigger className="lg:hidden" />

        <KestrelBrand
          variant="mark"
          showName
          label={title ?? 'Kestrel'}
          href="/chat"
          className="group px-1 transition-opacity hover:opacity-80"
        />
      </div>

      <div className="flex min-w-[44px] items-center justify-end gap-2">{right}</div>
    </header>
  );
}
