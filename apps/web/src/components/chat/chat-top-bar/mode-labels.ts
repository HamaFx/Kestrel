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

// Analysis-mode labels shared by the top bar and composer controls. The two
// canonical modes are `Fast Scout` (single-pass, live read-only tools) and
// `Convene Council` (4-desk parallel deliberation + Arbiter synthesis).

import type { AnalysisMode } from '@/lib/analysis-mode';

export type { AnalysisMode } from '@/lib/analysis-mode';

export const MODE_LABELS: Record<AnalysisMode, string> = {
  single: 'Fast Scout',
  full: 'Convene Council',
};

export const MODE_LABELS_COMPACT: Record<AnalysisMode, string> = {
  single: '⚡ Fast Scout',
  full: '🏛️ Convene Council',
};

export const MODE_DESCRIPTIONS: Record<AnalysisMode, string> = {
  single: 'Fast single-pass AI scout with live read-only market tools.',
  full: 'All 4 specialist desks + cross-examination + Arbiter trade plan.',
};
