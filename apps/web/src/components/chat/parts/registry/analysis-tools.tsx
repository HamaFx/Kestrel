'use client';

// SPDX-License-Identifier: Apache-2.0

// Analysis tools: knowledge search, technical/fundamental reads, journal stats,
// chart annotation/image analysis, correlation, COT, and snapshots. The three
// heaviest parts load through Next.js dynamic code splitting.
import {
  AnalyzeChartImageOutputSchema,
  AnalyzeFundamentalOutputSchema,
  AnalyzeTechnicalOutputSchema,
  AnnotateChartOutputSchema,
  GetCorrelationOutputSchema,
  GetCoTOutputSchema,
  GetJournalStatsOutputSchema,
  SearchKnowledgeOutputSchema,
  ShareSnapshotOutputSchema,
} from '@kestrel/shared';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

import { AnalyzeFundamentalPart } from '../analyze-fundamental';
import { AnalyzeTechnicalPart } from '../analyze-technical';
import { AnnotateChartPart } from '../annotate-chart';
import { GetJournalStatsPart } from '../get-journal-stats';
import { SearchKnowledgePart } from '../search-knowledge';
import { ShareSnapshotPart } from '../share-snapshot';
import { PartSkeletonFallback } from './part-skeleton';
import type { PartRegistryMap, PartSchemaMap, ToolPartProps } from './types';

const AnalyzeChartImagePart = dynamic(
  () => import('../analyze-chart-image').then((m) => m.AnalyzeChartImagePart),
  { loading: PartSkeletonFallback },
) as ComponentType<ToolPartProps<'analyze_chart_image'>>;

const GetCorrelationPart = dynamic(
  () => import('../get-correlation').then((m) => m.GetCorrelationPart),
  { loading: PartSkeletonFallback },
) as ComponentType<ToolPartProps<'get_correlation'>>;

const GetCoTPart = dynamic(() => import('../get-cot').then((m) => m.GetCoTPart), {
  loading: PartSkeletonFallback,
}) as ComponentType<ToolPartProps<'get_cot'>>;

export type AnalysisTool =
  | 'search_knowledge'
  | 'analyze_technical'
  | 'analyze_fundamental'
  | 'get_journal_stats'
  | 'annotate_chart'
  | 'analyze_chart_image'
  | 'get_correlation'
  | 'get_cot'
  | 'share_snapshot';

export const analysisParts = {
  registry: {
    search_knowledge: SearchKnowledgePart,
    analyze_technical: AnalyzeTechnicalPart,
    analyze_fundamental: AnalyzeFundamentalPart,
    get_journal_stats: GetJournalStatsPart,
    annotate_chart: AnnotateChartPart,
    analyze_chart_image: AnalyzeChartImagePart,
    get_correlation: GetCorrelationPart,
    get_cot: GetCoTPart,
    share_snapshot: ShareSnapshotPart,
  } satisfies Pick<PartRegistryMap, AnalysisTool>,
  schemas: {
    search_knowledge: SearchKnowledgeOutputSchema,
    analyze_technical: AnalyzeTechnicalOutputSchema,
    analyze_fundamental: AnalyzeFundamentalOutputSchema,
    get_journal_stats: GetJournalStatsOutputSchema,
    annotate_chart: AnnotateChartOutputSchema,
    analyze_chart_image: AnalyzeChartImageOutputSchema,
    get_correlation: GetCorrelationOutputSchema,
    get_cot: GetCoTOutputSchema,
    share_snapshot: ShareSnapshotOutputSchema,
  } satisfies Pick<PartSchemaMap, AnalysisTool>,
};
