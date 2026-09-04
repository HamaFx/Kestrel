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

// Root error boundary. Next.js renders this when any non-recoverable error
// surfaces during rendering. We log + show a recover button so the user
// isn't stuck on a blank screen.
import * as Sentry from '@sentry/nextjs';
import { Link } from 'next-view-transitions';
import { useEffect } from 'react';

import { KestrelBrand } from '@/components/brand/kestrel-brand';
import { Button } from '@/components/ui/button';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[RootErrorPage] Captured uncaught exception:', error);
    Sentry.captureException(error);
  }, [error]);

  const errorMessage =
    error?.message &&
    error.message !==
      'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive information. A digest was generated for this error.'
      ? error.message
      : null;

  return (
    <main className="bg-bg-elev-1 text-fg flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <KestrelBrand variant="lockup" decorative className="w-32" />
      <div className="flex flex-col items-center gap-2 text-center" role="alert">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-fg-muted max-w-sm text-sm">A stop-loss kicked in. Please try again.</p>
        {(errorMessage || error?.digest) && (
          <details className="text-fg-muted bg-bg/50 border-border/50 mt-2 max-w-md rounded border px-3 py-2 text-left font-mono text-xs">
            <summary className="cursor-pointer select-none text-[11px] opacity-75 hover:opacity-100">
              Technical details {error?.digest ? `(ID: ${error.digest})` : ''}
            </summary>
            <div className="mt-2 break-words text-[11px]">
              {errorMessage && <p className="text-danger/90">{errorMessage}</p>}
              {error?.digest && <p className="text-fg-subtle mt-1">Digest: {error.digest}</p>}
            </div>
          </details>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={() => reset()} size="sm">
          Try again
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            if (typeof window !== 'undefined') window.location.reload();
          }}
        >
          Reload
        </Button>
        <Link
          href="/chat"
          className="border-border bg-bg-elev-1 text-fg hover:bg-bg-elev-2 inline-flex h-9 items-center justify-center rounded-sm border px-3 text-sm font-medium transition-colors"
        >
          Go to chat
        </Link>
        <Link
          href="/"
          className="border-border bg-bg-elev-1 text-fg-muted hover:bg-bg-elev-2 inline-flex h-9 items-center justify-center rounded-sm border px-3 text-sm font-medium transition-colors"
        >
          Home
        </Link>
      </div>
    </main>
  );
}
