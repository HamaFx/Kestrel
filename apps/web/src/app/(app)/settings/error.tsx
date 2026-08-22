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
import { IconRefresh } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <p className="text-fg-muted text-sm">Something went wrong loading this page</p>
      <p className="text-fg-subtle text-caption max-w-sm text-center">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <Button type="button" size="sm" variant="secondary" onClick={() => reset()}>
        <IconRefresh className="size-3.5" />
        Try again
      </Button>
    </div>
  );
}
