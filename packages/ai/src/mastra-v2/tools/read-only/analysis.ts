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

// Phase 4 Task 2 — native Mastra registrations for the analysis-domain
// read-only tools. Each registration wraps the existing deterministic execute
// core via `createReadOnlyToolExecute`; there is no runtime adaptation step.
//
// Built lazily (see `read-only/index.ts`): reading the legacy tool bindings at
// module scope would race the `instance ↔ tools` import cycle.

import {
  AnalyzeChartImageInputSchema,
  AnalyzeFundamentalInputSchema,
  AnalyzeTechnicalInputSchema,
  AnnotateChartInputSchema,
  ComputeRiskInputSchema,
  ForecastVolatilityInputSchema,
  type AnalyzeChartImageOutput,
  type AnalyzeFundamentalOutput,
  type AnalyzeTechnicalOutput,
  type AnnotateChartOutput,
  type ComputeRiskOutput,
  type ForecastVolatilityOutput,
} from '@kestrel/shared';
import { createTool } from '@mastra/core/tools';
import type { z } from 'zod';

import { analyzeChartImageTool } from '@ai/tools/analyze-chart-image';
import { analyzeFundamentalTool } from '@ai/tools/analyze-fundamental';
import { analyzeTechnicalTool } from '@ai/tools/analyze-technical';
import { annotateChartTool } from '@ai/tools/annotate-chart';
import { computeRiskTool } from '@ai/tools/compute-risk';
import { forecastVolatilityTool } from '@ai/tools/forecast-volatility';
import {
  createReadOnlyToolExecute,
  executeLegacyReadOnlyTool,
  readOnlyToolDescription,
} from '@ai/mastra-v2/tools/tool-lifecycle';

/** Native analysis-domain read-only tools by registry name. */
export function buildAnalysisReadOnlyTools(): Readonly<Record<string, unknown>> {
  return {
    analyze_technical: createTool({
      id: 'kestrel-analyze_technical',
      description: readOnlyToolDescription(analyzeTechnicalTool, 'analyze_technical'),
      inputSchema: AnalyzeTechnicalInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof AnalyzeTechnicalInputSchema>,
        AnalyzeTechnicalOutput
      >('kestrel-analyze_technical', 'analyze_technical', (input, context) =>
        executeLegacyReadOnlyTool(analyzeTechnicalTool, input, context),
      ),
    }),
    analyze_fundamental: createTool({
      id: 'kestrel-analyze_fundamental',
      description: readOnlyToolDescription(analyzeFundamentalTool, 'analyze_fundamental'),
      inputSchema: AnalyzeFundamentalInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof AnalyzeFundamentalInputSchema>,
        AnalyzeFundamentalOutput
      >('kestrel-analyze_fundamental', 'analyze_fundamental', (input, context) =>
        executeLegacyReadOnlyTool(analyzeFundamentalTool, input, context),
      ),
    }),
    analyze_chart_image: createTool({
      id: 'kestrel-analyze_chart_image',
      description: readOnlyToolDescription(analyzeChartImageTool, 'analyze_chart_image'),
      inputSchema: AnalyzeChartImageInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof AnalyzeChartImageInputSchema>,
        AnalyzeChartImageOutput
      >('kestrel-analyze_chart_image', 'analyze_chart_image', (input, context) =>
        executeLegacyReadOnlyTool(analyzeChartImageTool, input, context),
      ),
    }),
    annotate_chart: createTool({
      id: 'kestrel-annotate_chart',
      description: readOnlyToolDescription(annotateChartTool, 'annotate_chart'),
      inputSchema: AnnotateChartInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof AnnotateChartInputSchema>,
        AnnotateChartOutput
      >('kestrel-annotate_chart', 'annotate_chart', (input, context) =>
        executeLegacyReadOnlyTool(annotateChartTool, input, context),
      ),
    }),
    forecast_volatility: createTool({
      id: 'kestrel-forecast_volatility',
      description: readOnlyToolDescription(forecastVolatilityTool, 'forecast_volatility'),
      inputSchema: ForecastVolatilityInputSchema,
      execute: createReadOnlyToolExecute<
        z.infer<typeof ForecastVolatilityInputSchema>,
        ForecastVolatilityOutput
      >('kestrel-forecast_volatility', 'forecast_volatility', (input, context) =>
        executeLegacyReadOnlyTool(forecastVolatilityTool, input, context),
      ),
    }),
    compute_risk: createTool({
      id: 'kestrel-compute_risk',
      description: readOnlyToolDescription(computeRiskTool, 'compute_risk'),
      inputSchema: ComputeRiskInputSchema,
      execute: createReadOnlyToolExecute<z.infer<typeof ComputeRiskInputSchema>, ComputeRiskOutput>(
        'kestrel-compute_risk',
        'compute_risk',
        (input, context) => executeLegacyReadOnlyTool(computeRiskTool, input, context),
      ),
    }),
  };
}
