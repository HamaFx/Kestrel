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

// SPDX-License-Identifier: Apache-2.0

// Public offline fallback — the target of every failed offline navigation.
//
// It intentionally lives outside the (app) route group: the authenticated shell
// needs a session and a database, neither of which exists offline, so this page
// is static, precached by the service worker, and reachable without auth
// (see src/proxy.ts, src/auth.config.ts and scripts/sw.template.js).
import { IconRefresh, IconWifiOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/formatters/cn';

export const dynamic = 'force-static';

export default function OfflinePage() {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    // Recover automatically the moment the device is back online.
    const handleOnline = () => {
      window.location.reload();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const handleRetry = () => {
    setRetrying(true);
    window.location.reload();
  };

  return (
    <section className="pb-safe pt-safe flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="bg-bg-elev-2 text-fg-subtle border-border flex size-16 items-center justify-center rounded-full border">
        <IconWifiOff className="size-8" aria-hidden="true" />
      </div>
      <KestrelBrand variant="lockup" decorative className="w-32" />
      <div className="flex flex-col gap-2">
        <h1 className="text-fg text-xl font-semibold tracking-tight">You&apos;re offline</h1>
        <p className="text-fg-muted max-w-sm text-sm">
          No connection to the market feed. Cached pages and features will continue to work while
          offline.
        </p>
      </div>
      <Button onClick={handleRetry} disabled={retrying} className="gap-2">
        <IconRefresh className={cn('h-4 w-4', retrying && 'animate-spin')} aria-hidden="true" />
        {retrying ? 'Reconnecting...' : 'Retry Connection'}
      </Button>
      <p className="text-fg-subtle max-w-xs text-xs">
        The installed app reconnects on its own as soon as your device is back online.
      </p>
    </section>
  );
}
