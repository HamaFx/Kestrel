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
import { usePathname } from 'next/navigation';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

interface ShellRouteContextValue {
  isChat: boolean;
  pathname: string;
}

const ShellRouteContext = createContext<ShellRouteContextValue | null>(null);

export function ShellRouteProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const isChat = pathname === '/chat' || pathname.startsWith('/chat/');

  const value = useMemo(
    () => ({
      isChat,
      pathname,
    }),
    [isChat, pathname],
  );

  return <ShellRouteContext.Provider value={value}>{children}</ShellRouteContext.Provider>;
}

export function useShellRoute(): ShellRouteContextValue {
  const ctx = useContext(ShellRouteContext);
  const pathname = usePathname() ?? '';
  if (ctx) {
    return ctx;
  }
  return {
    isChat: pathname === '/chat' || pathname.startsWith('/chat/'),
    pathname,
  };
}
