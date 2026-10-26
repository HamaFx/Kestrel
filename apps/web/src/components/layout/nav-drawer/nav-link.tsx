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
      <p className="text-fg-subtle px-3 pb-1 text-xs font-semibold tracking-wider uppercase">
        {label}
      </p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

export function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        prefetch={true}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group/nav focus-visible:ring-brand relative flex min-h-[56px] items-center gap-3 rounded-md px-3 transition-all focus-visible:ring-2 focus-visible:outline-none',
          active
            ? 'bg-bg-elev-2 text-fg surface-chip border-brand/40 shadow-sm'
            : 'text-fg-muted hover:bg-bg-elev-2/50 hover:text-fg border border-transparent',
        )}
      >
        {active && (
          <span
            aria-hidden="true"
            className="bg-brand absolute left-1 h-3.5 w-1 rounded-full shadow-[0_0_8px_rgba(255,54,22,0.6)]"
          />
        )}
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-9 items-center justify-center rounded-sm transition-colors',
            active
              ? 'bg-bg-elev-3 text-brand'
              : 'bg-bg-elev-2 text-fg-muted group-hover/nav:text-fg',
          )}
        >
          <Icon className="size-5" strokeWidth={active ? 2 : 1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm leading-tight font-semibold">{item.label}</span>
          {item.description ? (
            <span className="text-fg-subtle truncate text-xs leading-tight">
              {item.description}
            </span>
          ) : null}
        </div>
        {item.shortcut && (
          <kbd
            aria-hidden="true"
            className="text-fg-subtle/70 bg-white/[0.04] border-white/[0.08] ml-2 shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider"
          >
            {item.shortcut}
          </kbd>
        )}
      </Link>
    </li>
  );
}
