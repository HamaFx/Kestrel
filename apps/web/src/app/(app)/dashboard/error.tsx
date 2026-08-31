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

// Scoped error boundary for the dashboard view.
// Keeps the app chrome intact while showing an inline failure card.
import * as Sentry from '@sentry/nextjs';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      className="border-danger/30 bg-danger/5 flex flex-col gap-4 rounded-sm border p-6 text-center sm:text-left"
      role="alert"
    >
      <div className="flex items-center gap-3">
        <div className="bg-danger/10 text-danger rounded-sm p-2">
          <IconAlertTriangle className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-danger text-base font-bold">Dashboard unavailable</h1>
          <p className="text-fg-muted text-xs">
            An unexpected error occurred while rendering your dashboard widgets.
          </p>
        </div>
      </div>

      <p className="text-fg-subtle text-caption">
        Your widget arrangement and custom presets are safely preserved in storage.
      </p>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={() => reset()}
          size="sm"
          variant="secondary"
          className="inline-flex items-center gap-1.5"
        >
          <IconRefresh className="size-3.5" aria-hidden="true" />
          <span>Reload Dashboard</span>
        </Button>
      </div>
    </div>
  );
}
