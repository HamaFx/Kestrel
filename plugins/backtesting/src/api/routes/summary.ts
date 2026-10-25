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

// Dashboard widget summary route.

import type { PluginApiRouteHandler } from '@kestrel/plugin-sdk';

import { countBacktestRuns, countBacktestStrategies, listBacktestRuns } from '../../db/queries';
import { listKnowledge } from '../../knowledge';
import { ENGINE_VERSION, toRunSummary } from '../../services/run-service';
import { byMethod, execCtx, json, wrap } from './shared';

// ── Widget summary ───────────────────────────────────────────────────────

const summary = wrap(async (ctx) => {
  const [runs, runCount, strategyCount, documents] = await Promise.all([
    listBacktestRuns(ctx.userId, { limit: 1 }),
    countBacktestRuns(ctx.userId),
    countBacktestStrategies(ctx.userId),
    listKnowledge(execCtx(ctx)),
  ]);
  const latest = runs[0];
  return json({
    engineVersion: ENGINE_VERSION,
    runCount,
    strategyCount,
    knowledgeCount: documents.length,
    latestRun: latest ? toRunSummary(latest) : null,
  });
});

export const summaryRoutes: Readonly<Record<string, PluginApiRouteHandler>> = {
  '/summary': byMethod({ GET: summary }),
};
