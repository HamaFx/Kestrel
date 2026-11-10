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

// <Frame> — PanelUI-inspired concentric titled tray + recessed panel container.
// Separates the quiet outer bezel (`rounded-[20px] p-1.5`) from the inner
// `FramePanel` (`rounded-[14px]`, matching `--radius-pill-outer - padding =
// --radius-pill-concentric`) to eliminate double-border clutter.
// Pure CSS `data-slot` composition — safe for React Server Components.

import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/formatters/cn';

type FramePanelVariant = 'default' | 'band' | 'inset' | 'plain';

export function Frame({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      data-slot="frame"
      className={cn(
        'border-border/70 bg-bg-elev-1/75 flex flex-col gap-1 rounded-[20px] border p-1.5 shadow-[var(--shadow-sm)]',
        className,
      )}
      {...props}
    />
  );
}

export function FrameHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="frame-header"
      className={cn('flex flex-wrap items-center justify-between gap-2 px-2.5 py-1', className)}
      {...props}
    />
  );
}

export function FrameTitle({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="frame-title"
      className={cn(
        'text-fg-subtle font-mono text-[10px] font-semibold tracking-[0.14em] uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function FrameDescription({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="frame-description"
      className={cn('text-fg-subtle font-mono text-[10px] tabular-nums', className)}
      {...props}
    />
  );
}

export function FrameAction({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="frame-action"
      className={cn('ml-auto flex shrink-0 items-center gap-1.5', className)}
      {...props}
    />
  );
}

const panelVariants: Record<FramePanelVariant, string> = {
  default: 'surface-card rounded-[14px] border border-white/[0.07] p-3.5',
  band: 'surface-card divide-y divide-white/[0.06] overflow-hidden rounded-[14px] border border-white/[0.07] p-0',
  inset: 'surface-well rounded-[14px] border border-white/[0.06] p-3.5',
  plain: 'rounded-[14px] p-3',
};

export function FramePanel({
  variant = 'default',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: FramePanelVariant }) {
  return (
    <div
      data-slot="frame-panel"
      data-variant={variant}
      className={cn('flex flex-col gap-3', panelVariants[variant], className)}
      {...props}
    />
  );
}

export function FrameRow({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="frame-row"
      className={cn(
        'flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-white/[0.02]',
        className,
      )}
      {...props}
    />
  );
}

export function FrameFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="frame-footer"
      className={cn(
        'text-fg-subtle flex flex-wrap items-center justify-between gap-2 px-2.5 py-1 font-mono text-[9px] tabular-nums',
        className,
      )}
      {...props}
    />
  );
}
