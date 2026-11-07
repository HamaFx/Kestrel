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

// Premium settings section: a 4/8 architectural split on desktop, a hairline
// divider between sections, and a single right-hand property container.
import type { ReactNode } from 'react';

import { cn } from '@/lib/formatters/cn';

interface SettingsSectionProps {
  icon?: ReactNode;
  iconColor?: string;
  title: string;
  description?: string;
  /** Put the description on the left and the controls on the right at `lg`. */
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
        split &&
          'gap-4 border-b border-white/[0.07] pb-8 lg:grid lg:grid-cols-12 lg:items-start lg:gap-8',
      )}
    >
      <header
        className={cn(
          'flex items-center gap-3 px-0.5',
          split && 'lg:col-span-4 lg:flex-col lg:items-start lg:gap-2.5 lg:pt-1',
        )}
      >
        {icon ? (
          <span
            className="text-fg border-white/[0.08] inline-flex size-9 shrink-0 items-center justify-center rounded-lg border"
            style={{
              background: iconColor,
            }}
          >
            {icon}
          </span>
        ) : null}
        <div className="flex flex-col gap-1">
          <h2
            id={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
            className="font-display text-fg text-base font-normal tracking-tight sm:text-lg"
          >
            {title}
          </h2>
          {description ? (
            <p className="text-fg-subtle max-w-prose font-sans text-xs leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
      </header>
      <div className={cn('flex min-w-0 flex-col gap-3', split && 'lg:col-span-8')}>{children}</div>
    </section>
  );
}
