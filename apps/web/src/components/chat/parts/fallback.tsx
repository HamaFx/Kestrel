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
import { IconAlertTriangle } from '@tabler/icons-react';

export interface FallbackPartViewProps {
  part: {
    type: 'data-fallback';
    reason?: string;
    override?: string;
    message?: string;
  };
}

export function FallbackPartView(_props: FallbackPartViewProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="border-warn/30 bg-warn/10 text-fg text-body-sm mt-2 flex items-start gap-2 rounded-sm border p-3"
    >
      <IconAlertTriangle className="text-warn mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 leading-snug">
        <p className="text-warn font-semibold">Backup Analyst Model Used</p>
        <p className="text-fg-muted mt-0.5">
          The primary AI model was temporarily busy, so Kestrel completed this analysis using a
          backup model without interrupting your session.
        </p>
      </div>
    </div>
  );
}
