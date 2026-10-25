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
import type { PluginPageProps } from '@kestrel/plugin-sdk/ui';
import {
  IconAlertTriangle,
  IconChartLine,
  IconFlask,
  IconLoader2,
  IconRefresh,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';

import type {
  KnowledgeDocumentSummarySchema,
  RunJobStatus,
  RunSummarySchema,
  StrategySummarySchema,
} from '../schemas';
import { errorMessage, pluginFetch } from './api';
import { fmtMoney, fmtPct, toneClass } from './format';
import { KnowledgeBase } from './knowledge-base';
import { NewRunForm } from './new-run-form';
import { RunsList } from './runs-list';
import { StrategyLibrary } from './strategy-library';
import { SweepPanel } from './sweep-panel';

type RunSummary = z.infer<typeof RunSummarySchema>;
type StrategySummary = z.infer<typeof StrategySummarySchema>;
type DocumentSummary = z.infer<typeof KnowledgeDocumentSummarySchema>;

interface SummaryResponse {
  engineVersion: string;
  runCount: number;
  strategyCount: number;
  knowledgeCount: number;
  latestRun: RunSummary | null;
}

type Tab = 'new' | 'runs' | 'sweeps' | 'strategies' | 'knowledge';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'new', label: 'New run' },
  { id: 'runs', label: 'Runs' },
  { id: 'sweeps', label: 'Sweeps' },
  { id: 'strategies', label: 'Strategies' },
  { id: 'knowledge', label: 'Knowledge' },
];

export function BacktestingPage(_props: PluginPageProps) {
  const [tab, setTab] = useState<Tab>('new');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [strategies, setStrategies] = useState<StrategySummary[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<{
    name: string;
    source: string;
    params: Record<string, unknown>;
  } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [queuedJobId, setQueuedJobId] = useState<string | null>(null);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [summaryResult, runsResult, strategiesResult, knowledgeResult] = await Promise.allSettled(
      [
        pluginFetch<SummaryResponse>('/summary'),
        pluginFetch<{ runs: RunSummary[] }>('/runs?limit=50'),
        pluginFetch<{ strategies: StrategySummary[] }>('/strategies?limit=50'),
        pluginFetch<{ documents: DocumentSummary[] }>('/knowledge'),
      ],
    );

    if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value);
    if (runsResult.status === 'fulfilled') setRuns(runsResult.value.runs);
    if (strategiesResult.status === 'fulfilled') setStrategies(strategiesResult.value.strategies);
    if (knowledgeResult.status === 'fulfilled') setDocuments(knowledgeResult.value.documents);

    const failure = [summaryResult, runsResult, strategiesResult, knowledgeResult].find(
      (result) => result.status === 'rejected',
    );
    if (failure?.status === 'rejected') setError(errorMessage(failure.reason));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!queuedJobId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const status = await pluginFetch<RunJobStatus>(`/jobs/${encodeURIComponent(queuedJobId)}`);
        if (cancelled) return;
        setQueueMessage(status.message);
        if (status.state === 'completed' && status.runId) {
          window.location.assign(`/plugins/backtesting/runs/${encodeURIComponent(status.runId)}`);
          return;
        }
        if (status.state === 'failed' || status.state === 'cancelled') {
          setError(status.error ?? 'The background backtest failed.');
          setQueuedJobId(null);
          setQueueMessage(null);
        }
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err));
        setQueuedJobId(null);
        setQueueMessage(null);
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 2_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [queuedJobId]);

  const loadStrategyIntoForm = useCallback(async (strategy: StrategySummary) => {
    setBusyId(strategy.id);
    setError(null);
    try {
      const response = await pluginFetch<{
        strategy: {
          name: string;
          source: string;
          params: Record<string, unknown>;
        };
      }>(`/strategies/${encodeURIComponent(strategy.id)}`);
      setPrefill(response.strategy);
      setFormKey((value) => value + 1);
      setTab('new');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }, []);

  const removeRun = useCallback(
    async (runId: string) => {
      if (!window.confirm('Delete this backtest run? This cannot be undone.')) return;
      setBusyId(runId);
      try {
        await pluginFetch(`/runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });
        await load();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const removeStrategy = useCallback(
    async (strategyId: string) => {
      if (!window.confirm('Delete this saved strategy?')) return;
      setBusyId(strategyId);
      try {
        await pluginFetch(`/strategies/${encodeURIComponent(strategyId)}`, {
          method: 'DELETE',
        });
        await load();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Saved runs" value={String(summary?.runCount ?? runs.length)} />
        <Stat label="Strategies" value={String(summary?.strategyCount ?? strategies.length)} />
        <Stat label="Knowledge docs" value={String(summary?.knowledgeCount ?? documents.length)} />
        <div className="surface-panel flex flex-col gap-0.5 rounded-xl border border-white/10 p-3">
          <span className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
            Latest run
          </span>
          {summary?.latestRun ? (
            <>
              <span
                className={`font-mono text-sm font-semibold ${toneClass(summary.latestRun.metrics.netPnl)}`}
              >
                {fmtMoney(summary.latestRun.metrics.netPnl)}
              </span>
              <span className="text-fg-subtle font-mono text-[10px]">
                {summary.latestRun.symbol} · {fmtPct(summary.latestRun.metrics.returnPct, 1)}
              </span>
            </>
          ) : (
            <span className="text-fg-subtle text-xs">No runs yet</span>
          )}
        </div>
      </section>

      <div className="border-border/60 flex flex-wrap items-center gap-1 border-b pb-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={
              tab === entry.id
                ? 'bg-bg-elev-2 text-fg border-brand/40 rounded-md border px-3 py-1.5 text-xs font-semibold'
                : 'text-fg-subtle hover:text-fg rounded-md border border-transparent px-3 py-1.5 text-xs font-semibold'
            }
          >
            {entry.label}
            {entry.id === 'runs' && runs.length > 0 ? (
              <span className="text-fg-subtle ml-1 font-mono text-[10px]">{runs.length}</span>
            ) : null}
            {entry.id === 'strategies' && strategies.length > 0 ? (
              <span className="text-fg-subtle ml-1 font-mono text-[10px]">{strategies.length}</span>
            ) : null}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-fg-subtle hover:text-fg ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold disabled:opacity-50"
        >
          {loading ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconRefresh className="size-3.5" />
          )}
          Refresh
        </button>
      </div>

      {error ? (
        <div className="border-danger/30 bg-danger/5 text-danger flex items-start gap-2 rounded-lg border p-3 text-xs">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap">{error}</span>
        </div>
      ) : null}

      {queuedJobId ? (
        <div className="border-brand/30 bg-brand/5 text-brand flex items-center gap-2 rounded-lg border p-3 text-xs">
          <IconLoader2 className="size-4 animate-spin" />
          <span>
            Queued for the worker. {queueMessage ?? 'Waiting for a worker…'} Job{' '}
            <span className="font-mono">{queuedJobId.slice(0, 8)}</span>
          </span>
        </div>
      ) : null}

      {tab === 'new' ? (
        <NewRunForm
          key={formKey}
          strategies={strategies}
          prefill={prefill}
          onStarted={(runId) => {
            window.location.assign(`/plugins/backtesting/runs/${encodeURIComponent(runId)}`);
          }}
          onQueued={(jobId) => {
            setQueuedJobId(jobId);
            setQueueMessage('Waiting for a worker…');
            setTab('runs');
          }}
        />
      ) : null}

      {tab === 'runs' ? (
        <RunsList runs={runs} busyId={busyId} onDelete={(runId) => void removeRun(runId)} />
      ) : null}

      {tab === 'sweeps' ? <SweepPanel strategies={strategies} /> : null}

      {tab === 'strategies' ? (
        <StrategyLibrary
          strategies={strategies}
          busyId={busyId}
          onLoad={(strategy) => void loadStrategyIntoForm(strategy)}
          onDelete={(strategyId) => void removeStrategy(strategyId)}
        />
      ) : null}

      {tab === 'knowledge' ? (
        <KnowledgeBase documents={documents} onChanged={() => void load()} />
      ) : null}

      <footer className="text-fg-subtle flex items-center gap-2 text-[10px]">
        <IconFlask className="size-3" />
        {summary?.engineVersion ?? 'kestrel-engine-1'}
        <span className="text-border">·</span>
        <IconChartLine className="size-3" />
        Fills are next-bar; stop wins intrabar ties; costs applied on both sides.
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-panel flex flex-col gap-0.5 rounded-xl border border-white/10 p-3">
      <span className="text-fg-subtle text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </span>
      <span className="text-fg font-mono text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}
