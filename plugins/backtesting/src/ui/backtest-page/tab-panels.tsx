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

// Renders the panel for the active tab.
import { KnowledgeBase } from '../knowledge-base';
import { NewRunForm } from '../new-run-form';
import { RunsList } from '../runs-list';
import { StrategyLibrary } from '../strategy-library';
import { SweepPanel } from '../sweep-panel';
import type { BacktestPageController } from './use-backtest-page';

export function TabPanels({ page }: { page: BacktestPageController }) {
  return (
    <>
      {page.tab === 'new' ? (
        <NewRunForm
          key={page.formKey}
          strategies={page.strategies}
          prefill={page.prefill}
          onStarted={(runId) => {
            window.location.assign(`/plugins/backtesting/runs/${encodeURIComponent(runId)}`);
          }}
          onQueued={(jobId) => {
            page.startQueue(jobId);
          }}
        />
      ) : null}

      {page.tab === 'runs' ? (
        <RunsList
          runs={page.runs}
          busyId={page.busyId}
          onDelete={(runId) => void page.removeRun(runId)}
        />
      ) : null}

      {page.tab === 'sweeps' ? <SweepPanel strategies={page.strategies} /> : null}

      {page.tab === 'strategies' ? (
        <StrategyLibrary
          strategies={page.strategies}
          busyId={page.busyId}
          onLoad={(strategy) => void page.loadStrategyIntoForm(strategy)}
          onDelete={(strategyId) => void page.removeStrategy(strategyId)}
        />
      ) : null}

      {page.tab === 'knowledge' ? (
        <KnowledgeBase documents={page.documents} onChanged={() => void page.load()} />
      ) : null}
    </>
  );
}
