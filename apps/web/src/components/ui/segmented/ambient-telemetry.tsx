'use client';

// SPDX-License-Identifier: Apache-2.0

/**
 * Route-aware container that suppresses ambient telemetry (TickerTape, MarketSessionBar)
 * on /chat routes to eliminate invisible phantom polling and timer overhead underneath ChatScreen.
 */
import { useShellRoute } from '@/components/layout/shell-route-context';

export function AmbientTelemetry({ children }: { children?: React.ReactNode }) {
  const { isChat } = useShellRoute();
  if (isChat) return null;
  return children ? <>{children}</> : null;
}
