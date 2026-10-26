'use client';

// SPDX-License-Identifier: Apache-2.0

// Shared navigation primitives for the desktop rail and the mobile drawer.
//
// Before this existed, the primary list, the plugin list, the admin/settings
// rows, and the drawer's rows each hand-rolled the same active pill, brand
// laser, icon sizing and hover treatment — and they had drifted apart (icon
// 18px vs 20px, gap 10px vs 12px, active surface `/95` vs `/90`). One row
// component means one visual contract, on every surface, in both states.
//
// Voice rules (docs/design-system.md §2): navigation labels are Funnel Sans;
// Geist Mono is reserved for telemetry figures. No decorative index numbers,
// no keyboard-shortcut pills — the ⌘K palette is the single place commands are
// documented, and the shortcuts it lists are real.
import type { Icon } from '@tabler/icons-react';
import { m } from 'motion/react';
import { Link } from 'next-view-transitions';

import { MOTION_PRESETS } from '@/components/ui/motion-config';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/formatters/cn';

export interface NavRowProps {
  href: string;
  label: string;
  icon: Icon;
  active: boolean;
  /** Icon-only rail: the whole row collapses to a 40px target + tooltip. */
  collapsed?: boolean;
  /** Optional second line. Kept short — it renders inside a 224–340px rail. */
  description?: string;
}

export function NavRow({
  href,
  label,
  icon: RowIcon,
  active,
  collapsed = false,
  description,
}: NavRowProps) {
  const row = (
    <Link
      href={href}
      prefetch={true}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center rounded-lg transition-colors select-none',
        collapsed ? 'mx-auto size-10 justify-center' : 'min-h-9 gap-2.5 px-2.5 py-1.5',
        active ? 'text-fg' : 'text-fg-muted hover:text-fg hover:bg-white/[0.04]',
      )}
    >
      {active ? (
        <>
          <m.span
            layoutId="sidebar-active-bg"
            aria-hidden="true"
            className="bg-bg-elev-2/95 border-brand/40 pointer-events-none absolute inset-0 rounded-lg border shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.4)]"
            transition={MOTION_PRESETS.layout}
          />
          <m.span
            layoutId="sidebar-active-pill"
            aria-hidden="true"
            className={cn(
              'bg-brand pointer-events-none absolute rounded-full shadow-[0_0_12px_rgba(255,54,22,0.85)]',
              collapsed ? 'top-2.5 bottom-2.5 left-1 w-1' : 'left-1.5 h-4 w-1',
            )}
            transition={MOTION_PRESETS.layout}
          />
        </>
      ) : null}

      <RowIcon
        className={cn(
          'z-10 size-4.5 shrink-0 transition-colors',
          active ? 'text-brand' : 'text-fg-subtle group-hover:text-fg',
        )}
        strokeWidth={active ? 2 : 1.75}
        aria-hidden="true"
      />

      {!collapsed ? (
        <span className="z-10 flex min-w-0 flex-col">
          <span
            className={cn(
              'truncate font-sans text-[13px] leading-tight tracking-tight',
              active ? 'font-medium' : 'font-normal',
            )}
          >
            {label}
          </span>
          {description ? (
            <span className="text-fg-subtle truncate font-sans text-[11px] leading-tight">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );

  if (collapsed) {
    return (
      <li>
        <Tooltip label={label} side="right" className="w-full justify-center">
          {row}
        </Tooltip>
      </li>
    );
  }

  return <li>{row}</li>;
}

/**
 * A labelled group of rows. The label is a quiet sans eyebrow — the `//`
 * terminal motif and monospace belong to telemetry, not to navigation.
 */
export function NavSection({
  label,
  children,
  className,
}: {
  /** Omit in the collapsed rail: a category label has nothing to collapse into. */
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col', className)}>
      {label ? (
        <h2 className="text-fg-subtle/80 px-2.5 pt-1 pb-1 font-sans text-[10px] font-medium tracking-[0.14em] uppercase">
          {label}
        </h2>
      ) : null}
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}
