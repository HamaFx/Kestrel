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

import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, description, icon, children }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-2 pb-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {icon ? (
            <span
              aria-hidden="true"
              className="text-brand surface-chip bg-bg-elev-2 inline-flex size-11 items-center justify-center rounded-xl border border-edge/60 shadow-xs"
            >
              {icon}
            </span>
          ) : null}
          <h1 className="text-fg font-display text-2xl sm:text-3xl font-normal tracking-[-0.02em]">
            {title}
          </h1>
        </div>
        {children ? <div className="flex items-center gap-2">{children}</div> : null}
      </div>
      {description ? (
        <p className="text-fg-muted font-sans text-sm leading-normal">{description}</p>
      ) : null}
    </header>
  );
}
