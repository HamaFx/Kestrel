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
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { useShellRoute } from './shell-route-context';
import { useSidebarState } from './sidebar-state-context';

export function AppShellContainer({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebarState();
  const { isChat } = useShellRoute();

  return (
    <div
      className={cn(
        'transition-[padding] duration-200 ease-in-out',
        collapsed ? 'lg:pl-16' : 'lg:pl-56',
        isChat ? 'flex h-svh flex-col overflow-hidden' : 'min-h-svh',
      )}
    >
      {children}
    </div>
  );
}

export function AppShellMain({ children }: { children: ReactNode }) {
  const { isChat } = useShellRoute();

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn(
        'focus:outline-none',
        isChat
          ? 'flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden p-0'
          : 'mx-auto w-full max-w-2xl px-4 pt-4 pb-20 md:max-w-4xl lg:max-w-5xl lg:pb-6 xl:max-w-7xl xl:px-6',
      )}
      style={{
        viewTransitionName: 'main-content',
      }}
    >
      {children}
    </main>
  );
}
