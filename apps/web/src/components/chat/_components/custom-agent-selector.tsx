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
import { IconChevronDown, IconUsersGroup } from '@tabler/icons-react';
import Link from 'next/link';

import type { CustomAgentSummary } from '@/hooks/use-custom-agents';
import { usePopupMenu } from '@/hooks/use-popup-menu';
import { cn } from '@/lib/formatters/cn';

export function CustomAgentSelector({
  agents,
  value,
  onChange,
  disabled,
}: {
  agents: readonly CustomAgentSummary[];
  value: string | null;
  onChange: (slug: string | null) => void;
  disabled?: boolean;
}) {
  const menu = usePopupMenu({ focusFirstOnOpen: false });
  const active = value ? agents.find((agent) => agent.slug === value) : null;
  if (agents.length === 0) return null;

  return (
    <div className="relative shrink-0" ref={menu.menuRef}>
      <button
        ref={menu.triggerRef}
        type="button"
        disabled={disabled}
        onClick={menu.toggle}
        aria-label="Custom agent"
        title={active ? `Agent: ${active.name}` : 'Agent: Kestrel Core'}
        {...menu.triggerProps}
        className={cn(
          'text-caption inline-flex min-h-9 items-center gap-1 rounded-sm px-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          active
            ? 'border-brand/40 bg-brand/10 text-brand border'
            : 'text-fg-muted hover:text-fg hover:bg-bg-elev-2 active:bg-bg-elev-3',
        )}
      >
        <IconUsersGroup className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden max-w-28 truncate sm:inline">
          {active ? `@${active.slug}` : 'Kestrel Core'}
        </span>
        <IconChevronDown className="size-3 shrink-0" aria-hidden="true" />
      </button>

      {menu.open ? (
        <div
          {...menu.menuProps}
          className="bg-bg-elev-1 border-border absolute top-full right-0 z-50 mt-2 w-64 rounded-sm border p-1.5 shadow-xl"
        >
          <div className="text-caption text-fg-subtle px-2 pb-1">Applies to your next message</div>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onChange(null);
              menu.close();
            }}
            className="hover:bg-bg-elev-2 flex min-h-9 w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left"
          >
            <span className="min-w-0">
              <span className="text-fg block text-xs font-semibold">Kestrel Core</span>
              <span className="text-fg-subtle block text-[10px]">
                Canonical research chat + committee routing
              </span>
            </span>
          </button>
          <div className="border-border/60 my-1 border-t" />
          {agents.map((agent) => (
            <button
              key={agent.id}
              role="menuitem"
              type="button"
              onClick={() => {
                onChange(agent.slug);
                menu.close();
              }}
              className={cn(
                'hover:bg-bg-elev-2 flex min-h-9 w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left',
                agent.slug === value && 'bg-brand/5',
              )}
            >
              <span className="min-w-0">
                <span className="text-fg block text-xs font-semibold">{agent.name}</span>
                <span className="text-fg-subtle block font-mono text-[10px]">@{agent.slug}</span>
              </span>
            </button>
          ))}
          <div className="border-border/60 my-1 border-t" />
          <Link
            href="/plugins/custom-agents"
            onClick={menu.close}
            className="text-fg-subtle hover:text-fg block rounded-sm px-2 py-1.5 text-[10px] font-semibold"
          >
            Manage agents →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
