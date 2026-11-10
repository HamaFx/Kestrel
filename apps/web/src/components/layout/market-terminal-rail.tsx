// SPDX-License-Identifier: Apache-2.0

// Shared desktop split-rail primitives for the three market intelligence
// routes. Pages keep their own route view in the 8-column primary pane and
// compose the 4-column sticky companion from these building blocks, so the
// rail never imports back into an app route segment.
import type { EconomicEvent, NewsArticle } from '@kestrel/shared';
import { IconArrowRight } from '@tabler/icons-react';
import { Link } from 'next-view-transitions';

import {
  Frame,
  FrameAction,
  FrameHeader,
  FramePanel,
  FrameRow,
  FrameTitle,
} from '@/components/ui/frame';
import { cn } from '@/lib/formatters/cn';

export function MarketTerminalLayout({
  children,
  rail,
}: {
  children: React.ReactNode;
  rail?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12 xl:gap-6">
      <div className="min-w-0 xl:col-span-8">{children}</div>
      {rail ? (
        <aside className="hidden xl:sticky xl:top-4 xl:col-span-4 xl:flex xl:flex-col xl:gap-4">
          {rail}
        </aside>
      ) : null}
    </div>
  );
}

export function RailPanel({
  title,
  href,
  children,
  bleed = false,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
  /** Skip the card chrome when the child already renders its own panel. */
  bleed?: boolean;
}) {
  const header = (
    <FrameHeader>
      <FrameTitle>{title}</FrameTitle>
      {href ? (
        <FrameAction>
          <Link
            href={href}
            className="text-brand hover:text-brand-soft inline-flex items-center gap-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase"
          >
            Open
            <IconArrowRight className="size-2.5" />
          </Link>
        </FrameAction>
      ) : null}
    </FrameHeader>
  );

  if (bleed) {
    return (
      <section className="flex flex-col gap-2">
        {header}
        {children}
      </section>
    );
  }

  return (
    <Frame>
      {header}
      <FramePanel variant="default">{children}</FramePanel>
    </Frame>
  );
}

function utcTime(ms: number): string {
  return `${new Date(ms).toISOString().slice(11, 16)} UTC`;
}

export function TodayEvents({ events }: { events: readonly EconomicEvent[] }) {
  const now = Date.now();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const dayEnd = start.getTime() + 86_400_000;
  const today = events.filter((event) => event.date >= now && event.date < dayEnd).slice(0, 4);

  if (today.length === 0) {
    return (
      <p className="text-fg-subtle px-0.5 py-2 font-mono text-[10px]">No releases left today.</p>
    );
  }

  return (
    <div className="divide-y divide-white/[0.06]">
      {today.map((event) => (
        <FrameRow key={event.id} className="px-0 py-2 hover:bg-transparent">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                event.importance === 'high'
                  ? 'bg-danger'
                  : event.importance === 'medium'
                    ? 'bg-warn'
                    : 'bg-fg-subtle',
              )}
            />
            <span className="text-fg-muted truncate font-sans text-[11px]">{event.title}</span>
          </div>
          <span className="text-fg-subtle shrink-0 font-mono text-[9px] tabular-nums">
            {utcTime(event.date)}
          </span>
        </FrameRow>
      ))}
    </div>
  );
}

export function HeadlineList({ articles }: { articles: readonly NewsArticle[] }) {
  const top = articles.slice(0, 5);
  if (top.length === 0) {
    return <p className="text-fg-subtle py-2 font-mono text-[10px]">No headlines loaded.</p>;
  }
  return (
    <ul className="divide-y divide-white/[0.06]">
      {top.map((article) => (
        <li key={article.id} className="py-2">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg-muted hover:text-fg line-clamp-2 font-sans text-[11px] leading-snug transition-colors"
          >
            {article.title}
          </a>
          <span className="text-fg-subtle/60 mt-0.5 block font-mono text-[8px] uppercase">
            {article.publisher ?? article.source} · {utcTime(article.publishedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
