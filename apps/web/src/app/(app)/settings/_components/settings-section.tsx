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

// Premium settings section.

import type { ReactNode } from 'react';

import { cn } from '@/lib/formatters/cn';

interface SettingsSectionProps {
  icon?: ReactNode;
  iconColor?: string;
  title: string;
  description?: string;
  /** Put the description on the left and the controls on the right at `md`. */
  layout?: 'stacked' | 'split';
  children: ReactNode;
}

export function SettingsSection({
  icon,
  iconColor = 'var(--color-bg-elev-3)',
  title,
  description,
  layout = 'stacked',
  children,
}: SettingsSectionProps) {
  const split = layout === 'split';

  return (
    <section
      aria-labelledby={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
      className={cn(
        'flex flex-col gap-3',
        split && 'md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-start md:gap-8',
      )}
    >
      <header
        className={cn(
          'flex items-center gap-3 px-0.5',
          split && 'md:flex-col md:items-start md:gap-2 md:pt-1',
        )}
      >
        {icon ? (
          <span
            className="text-fg inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm"
            style={{
              background: iconColor,
            }}
          >
            {icon}
          </span>
        ) : null}
        <div className="flex flex-col gap-0.5">
          <h2
            id={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
            className="text-fg text-sm font-semibold tracking-tight sm:text-base"
          >
            {title}
          </h2>
          {description ? (
            <p className="text-fg-subtle text-xs leading-normal">{description}</p>
          ) : null}
        </div>
      </header>
      <div className={cn('flex flex-col gap-3', split && 'min-w-0')}>{children}</div>
    </section>
  );
}
