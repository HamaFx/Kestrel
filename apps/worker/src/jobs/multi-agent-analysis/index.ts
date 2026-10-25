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

// Durable full-analysis worker barrel. Every name previously exported from
// `src/jobs/multi-agent-analysis.ts` is re-exported here so `./multi-agent-
// analysis.js`, `../src/jobs/multi-agent-analysis` and
// `./multi-agent-analysis/index.js` imports keep resolving unchanged.

export { runDurableResearchJob, runMultiAgentAnalysis } from './run.js';
export { _resetFullAnalysisSweepThrottles } from './sweeps.js';
