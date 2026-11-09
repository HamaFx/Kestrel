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

// SettingsRow — one flush property line:
//   [optional icon]  [label + optional description]   [right action]
// Sits inside a shared `divide-y` container; no nested card borders, no
// competing shadows. Rows stay at least 56px tall for touch.
import type { ReactNode } from 'react';

import { cn } from '@/lib/formatters/cn';

interface SettingsRowProps {
  icon?: ReactNode;
  iconColor?: string;
  label: string;
  description?: ReactNode;
  /** Right-aligned action — button, switch, status pill, etc. */
  action: ReactNode;
  /** Stack the description below or wrap on narrow screens. */
  stack?: boolean;
  className?: string;
}

export function SettingsRow({
  icon,
  iconColor = 'var(--color-bg-elev-2)',
  label,
  description,
  action,
  stack,
  className,
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        'flex min-h-14 items-center gap-3 py-1.5',
        stack ? 'flex-col items-stretch gap-3' : '',
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className="text-fg-muted border-white/[0.08] inline-flex size-8 shrink-0 items-center justify-center rounded-lg border"
          style={{
            background: iconColor,
          }}
        >
          {icon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-fg font-sans text-sm leading-tight font-medium">{label}</span>
        {description ? (
          <span className="text-fg-subtle font-sans text-xs leading-snug">{description}</span>
        ) : null}
      </div>
      {!stack ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      {stack ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
