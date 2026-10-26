'use client';

// SPDX-License-Identifier: Apache-2.0

/**
 * Route-aware container that keeps ambient market telemetry (TickerTape,
 * MarketSessionBar) out of surfaces where live price chrome is noise and the
 * polling/timers underneath it are pure overhead:
 *
 *   - `/chat` — the cockpit renders its own session/price telemetry
 *   - `/settings/*` — account surfaces (profile, security, appearance, …)
 *   - `/admin/*` — operator surfaces (health, logs, audit, …)
 */
import { useShellRoute } from '@/components/layout/shell-route-context';

export function AmbientTelemetry({ children }: { children?: React.ReactNode }) {
  const { isChat, pathname } = useShellRoute();
  const isAccountSurface = pathname.startsWith('/settings') || pathname.startsWith('/admin');
  if (isChat || isAccountSurface) return null;
  return children ? <>{children}</> : null;
}
