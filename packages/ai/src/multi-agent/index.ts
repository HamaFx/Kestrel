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

// SPDX-License-Identifier: Apache-2.0

// Compatibility barrel: mode classification and historical opinion persistence
// remain available to existing UI/admin surfaces. Agent orchestration itself
// is implemented under packages/ai/src/mastra.

export {
  selectAgents,
  autoDetectMode,
  resolveMode,
  MODE_OPTIONS,
  type ModeMeta,
  type AnalysisMode,
  type ResolvedMode,
} from './modes';
export {
  saveAgentOpinions,
  listAgentOpinions,
  listMessageOpinions,
  type SaveOpinionsArgs,
} from './persistence';
