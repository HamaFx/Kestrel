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

import { definePluginUi } from '@kestrel/plugin-sdk/ui';

import { BacktestingPage } from './backtest-page';
import { BacktestResultCard } from './backtest-result-card';
import { BacktestingWidget } from './dashboard-widget';
import { BacktestRunPage } from './run-detail-page';
import { BacktestRunsCard } from './runs-card';

const ui = definePluginUi({
  chatToolParts: {
    backtest_run_strategy: { component: BacktestResultCard },
    backtest_get_run: { component: BacktestResultCard },
    backtest_list_runs: { component: BacktestRunsCard },
  },
  navItems: [
    {
      href: '/plugins/backtesting',
      label: 'Backtesting',
      iconName: 'IconFlask',
      description: 'Strategy lab, runs & playbooks',
      match: ['/plugins/backtesting'],
      order: 20,
    },
  ],
  pages: [
    { path: '', component: BacktestingPage },
    { path: 'runs/:runId', component: BacktestRunPage },
  ],
  dashboardWidgets: [
    {
      id: 'backtesting-latest',
      title: 'Backtesting Lab',
      description: 'Latest run scorecard and research counts',
      component: BacktestingWidget,
      defaultSize: 'sm',
    },
  ],
  slashCommands: [
    {
      id: 'backtest',
      label: 'Backtest a strategy',
      description: 'Open the strategy lab and run a backtest',
    },
  ],
});

export default ui;
