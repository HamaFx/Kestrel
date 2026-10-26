'use client';

// SPDX-License-Identifier: Apache-2.0

// Presentational nav primitives for the drawer: a labelled <Section> and a
// single <NavLink> row with active styling.
import { Link } from 'next-view-transitions';

import { cn } from '@/lib/formatters/cn';

import type { NavItem } from '../nav-items';

export function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 pt-3 first:pt-0">
      <div className="flex items-center gap-2 px-3 pb-1 font-mono text-[9px] font-semibold tracking-wider text-fg-subtle/70 uppercase">
        <span>// {label}</span>
        <span className="h-px flex-1 bg-white/[0.06]" />
      </div>
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  );
}

export function NavLink({
  item,
  active,
  code,
}: {
  item: NavItem;
  active: boolean;
  code?: string;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        prefetch={true}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group/nav relative flex min-h-[50px] items-center gap-2.5 rounded-lg px-3 transition-all select-none',
          active
            ? 'bg-bg-elev-2/95 text-fg border border-brand/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.4)]'
            : 'text-fg-muted hover:bg-white/[0.04] hover:text-fg border border-transparent',
        )}
      >
        {active && (
          <span
            aria-hidden="true"
            className="bg-brand absolute left-1 h-5 w-1 rounded-full shadow-[0_0_12px_rgba(255,54,22,0.85)]"
          />
        )}
        {code && (
          <span
            className={cn(
              'font-mono text-[11px] font-bold tracking-tight',
              active ? 'text-brand' : 'text-fg-subtle/50',
            )}
          >
            {code}
          </span>
        )}
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-8 items-center justify-center rounded-md transition-colors',
            active
              ? 'bg-brand/15 text-brand'
              : 'bg-white/[0.04] text-fg-subtle group-hover/nav:text-fg',
          )}
        >
          <Icon className="size-4.5" strokeWidth={active ? 2 : 1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold tracking-tight leading-tight">{item.label}</span>
          {item.description ? (
            <span className="text-fg-subtle truncate font-mono text-[10px] leading-tight">
              {item.description}
            </span>
          ) : null}
        </div>
        {item.shortcut && (
          <kbd
            aria-hidden="true"
            className="text-fg-subtle/70 bg-white/[0.04] border-white/[0.08] ml-2 shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-wider"
          >
            {item.shortcut}
          </kbd>
        )}
      </Link>
    </li>
  );
}
