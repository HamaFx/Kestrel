'use client';

// SPDX-License-Identifier: Apache-2.0

// Roving-keyboard-navigable model row for the regenerate & composer model picker.
// Blended with PanelUI's ModelPicker capability telemetry pills and gliding highlight.
import type { CatalogModel } from '@kestrel/shared';
import { IconCircleCheck, IconEye, IconTool } from '@tabler/icons-react';
import { m } from 'motion/react';

import { cn } from '@/lib/formatters/cn';

import { formatContextTokens } from '../model-picker-utils';

type ModelTier = NonNullable<CatalogModel['tier']>;

const TIER_STYLES: Record<ModelTier, { label: string; className: string }> = {
  flagship: {
    label: 'FLAGSHIP',
    className: 'border-brand/35 bg-brand/12 text-brand',
  },
  pro: {
    label: 'PRO',
    className: 'border-white/12 bg-white/[0.05] text-fg-muted',
  },
  fast: {
    label: 'FAST',
    className: 'border-bull/35 bg-bull/12 text-bull',
  },
  lite: {
    label: 'LITE',
    className: 'border-white/10 bg-white/[0.03] text-fg-subtle',
  },
  embedding: {
    label: 'EMBED',
    className: 'border-white/10 bg-white/[0.03] text-fg-subtle',
  },
};

export function RegenRow({
  label,
  fullyQualified,
  isActive,
  isHighlighted = false,
  highlightLayoutId,
  tier,
  hasVision = false,
  hasTools = false,
  contextTokens,
  onHover,
  onClick,
}: {
  label: string;
  fullyQualified: string;
  isActive: boolean;
  isHighlighted?: boolean;
  highlightLayoutId?: string;
  tier?: CatalogModel['tier'];
  hasVision?: boolean;
  hasTools?: boolean;
  contextTokens?: number;
  onHover?: () => void;
  onClick: () => void;
}) {
  const ctxBadge = formatContextTokens(contextTokens);
  const tierMeta = tier ? TIER_STYLES[tier] : null;

  return (
    <button
      type="button"
      role="menuitem"
      data-model-id={fullyQualified}
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={onClick}
      className={cn(
        'text-fg relative flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors focus:outline-none',
        isActive ? 'text-fg font-medium' : 'text-fg-muted hover:text-fg focus:text-fg',
      )}
    >
      {isHighlighted && highlightLayoutId ? (
        <m.span
          layoutId={highlightLayoutId}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-lg border border-white/[0.08] bg-white/[0.06]"
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        />
      ) : null}

      <span className="relative z-10 flex min-w-0 items-center gap-1.5 truncate">
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 shrink-0 rounded-full transition-colors',
            isActive
              ? 'bg-brand shadow-[0_0_8px_rgba(255,54,22,0.75)]'
              : 'bg-white/15 group-hover:bg-white/30',
          )}
        />
        <span className="truncate">{label}</span>
      </span>

      <span className="relative z-10 flex shrink-0 items-center gap-1.5">
        {hasTools ? (
          <span
            title="Supports tool calling"
            className="text-fg-subtle inline-flex items-center"
          >
            <IconTool size={12} aria-hidden="true" />
          </span>
        ) : null}
        {hasVision ? (
          <span
            title="Supports chart & image vision"
            className="text-fg-subtle inline-flex items-center"
          >
            <IconEye size={12} aria-hidden="true" />
          </span>
        ) : null}
        {ctxBadge ? (
          <span className="text-fg-subtle font-mono text-[10px] tabular-nums">{ctxBadge}</span>
        ) : null}
        {tierMeta ? (
          <span
            className={cn(
              'rounded border px-1 py-0.25 font-mono text-[9px] leading-tight font-semibold tracking-wider uppercase',
              tierMeta.className,
            )}
          >
            {tierMeta.label}
          </span>
        ) : null}
        {isActive ? (
          <IconCircleCheck size={14} className="text-brand shrink-0" aria-hidden="true" />
        ) : null}
      </span>
    </button>
  );
}
