// SPDX-License-Identifier: Apache-2.0

// Analysis-mode labels shared by the top bar and composer controls.

import type { AnalysisMode } from '@/lib/analysis-mode';

export type { AnalysisMode } from '@/lib/analysis-mode';

export const MODE_LABELS: Record<AnalysisMode, string> = {
  single: 'Quick Read',
  full: 'Full Committee',
};

export const MODE_DESCRIPTIONS: Record<AnalysisMode, string> = {
  single: 'Single-desk analysis — one technical desk. Use Full for the 4-desk committee.',
  full: 'All 4 specialist desks + trade plan',
};
