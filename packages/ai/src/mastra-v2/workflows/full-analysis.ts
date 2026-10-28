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

// Full-analysis durable queue facade. Admission, claiming, lifecycle,
// projection, and read APIs live in focused modules.

export * from './full-analysis-types';
export { enqueueFullAnalysis } from './full-analysis-enqueue';
export { claimNextFullAnalysisRun } from './full-analysis-claim';
export {
  clearFullAnalysisWorkflowState,
  completeFullAnalysisRun,
  failFullAnalysisRun,
  purgeOldFullAnalysisRuns,
  recoverStaleFullAnalysisRuns,
  requeueFullAnalysisRun,
  touchFullAnalysisRun,
  updateFullAnalysisProgress,
} from './full-analysis-lifecycle';
export {
  cancelFullAnalysisRun,
  getFullAnalysisQueueHealth,
  getFullAnalysisRun,
  reconcileFullAnalysisSnapshots,
} from './full-analysis-read';
