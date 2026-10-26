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

// 2.3 — AI trade review panel for closed journal entries.
// Lives in the analytics tab and lets the user request a post-trade review for
// ANY closed trade (not just the newest one). The review is streamed from
// /api/journal/review.
import type { JournalEntry } from '@kestrel/shared';
import { IconAlertCircle, IconBolt, IconRefresh } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Button } from '@/components/ui/button';
import { fetchCsrf } from '@/lib/auth/csrf';
import { cn } from '@/lib/formatters/cn';

interface TradeReviewResponse {
  review: {
    review: string;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    latencyMs: number;
  };
}

interface AiReviewPanelProps {
  /** All journal entries — the panel reviews any closed one. */
  entries: readonly JournalEntry[];
}

export function AiReviewPanel({ entries }: AiReviewPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // `text` + `modelId` ride in one state slot (the file's useState budget).
  const [review, setReview] = useState<{ text: string; modelId: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closed = useMemo(() => entries.filter((e) => e.outcome !== 'open'), [entries]);
  // Fall back to the newest closed trade until the user picks one (entries can
  // arrive after the first render while the journal query resolves).
  const activeId = selectedId ?? closed[0]?.id ?? null;
  const entry = closed.find((e) => e.id === activeId) ?? null;

  // Reset review state when the selection changes so stale reviews aren't
  // shown for a different trade.
  useEffect(() => {
    setReview(null);
    setError(null);
  }, [activeId]);

  async function generateReview() {
    if (!entry) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCsrf('/api/journal/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: entry.id }),
      });
      const body = (await res.json()) as { error?: { message: string } } | TradeReviewResponse;
      if (!res.ok) {
        throw new Error(
          'error' in body && body.error?.message ? body.error.message : `HTTP ${res.status}`,
        );
      }
      const data = body as TradeReviewResponse;
      setReview({ text: data.review.review, modelId: data.review.modelId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setLoading(false);
    }
  }

  if (!entry) {
    return (
      <div className="surface-panel text-fg-subtle flex items-start gap-3 rounded-xl border border-white/10 p-5">
        <IconAlertCircle className="mt-0.5 size-5 shrink-0" />
        <p className="text-sm">Close a trade to unlock an AI-powered post-trade review.</p>
      </div>
    );
  }

  return (
    <div className="surface-panel flex flex-col gap-4 rounded-xl border border-white/10 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <IconBolt className="text-fg size-4" />
          <h3 className="text-fg text-sm font-semibold">AI Trade Review</h3>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="ai-review-trade" className="sr-only">
            Closed trade to review
          </label>
          <select
            id="ai-review-trade"
            value={entry.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="bg-bg-elev-2 text-fg border-border focus:border-brand/50 focus:ring-brand/20 max-w-[16rem] rounded-md border px-2 py-1 font-mono text-xs focus:ring-2 focus:outline-none"
          >
            {closed.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.symbol} {candidate.side} ·{' '}
                {candidate.rMultiple === null
                  ? '—'
                  : `${candidate.rMultiple > 0 ? '+' : ''}${candidate.rMultiple.toFixed(2)}R`}{' '}
                · {new Date(candidate.closedAt ?? candidate.openedAt).toISOString().slice(0, 10)}
              </option>
            ))}
          </select>
          <Button
          size="sm"
          variant="secondary"
          onClick={generateReview}
          loading={loading}
          disabled={loading}
          className="shrink-0"
        >
          {review ? (
            <>
              <IconRefresh className="size-4" />
              Regenerate
            </>
          ) : (
            <>
              <IconBolt className="size-4" />
              Generate Review
            </>
          )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-danger/5 border-danger/20 text-danger flex items-start gap-2 rounded-lg border p-3 text-sm">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      {review ? (
        <div className="flex flex-col gap-3">
          <div
            className={cn(
              'prose prose-sm prose-invert max-w-none',
              'text-fg [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold',
              '[&_li]:mb-1 [&_ul]:list-disc [&_ul]:pl-5',
              '[&_p]:text-fg-subtle [&_p]:text-sm [&_p]:leading-[1.4]',
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{review.text}</ReactMarkdown>
          </div>
          <p className="text-fg-muted text-xs">
            Generated by <span className="text-fg-subtle font-medium">{review.modelId}</span>
          </p>
        </div>
      ) : (
        <p className="text-fg-subtle text-sm">
          Get a concise post-trade breakdown: execution grade, risk management notes, process
          observations, and one action item for next time.
        </p>
      )}
    </div>
  );
}
