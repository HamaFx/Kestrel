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

// Route-aware container that keeps ambient market telemetry (TickerTape,
// MarketSessionBar) out of surfaces where live price chrome is noise and the
// polling/timers underneath it are pure overhead:
//
//   - `/chat` — the cockpit renders its own session/price telemetry
//   - `/settings/*` — account surfaces (profile, security, appearance, …)
//   - `/admin/*` — operator surfaces (health, logs, audit, …)

import { useShellRoute } from '@/components/layout/shell-route-context';

export function AmbientTelemetry({ children }: { children?: React.ReactNode }) {
  const { isChat, pathname } = useShellRoute();
  const isAccountSurface = pathname.startsWith('/settings') || pathname.startsWith('/admin');
  if (isChat || isAccountSurface) return null;
  return children ? <>{children}</> : null;
}
