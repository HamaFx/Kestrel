'use client';

// SPDX-License-Identifier: Apache-2.0

// Phase 7 advanced tools: risk/volatility math, session levels, intermarket,
// seasonality, position health, replay, committee, diagnostics, social flow,
// and web search. Most load through Next.js dynamic code splitting.
import {
  ComputePositionHealthOutputSchema,
  ComputeRiskOutputSchema,
  ConveneCommitteeOutputSchema,
  ForecastVolatilityOutputSchema,
  GetIntermarketOutputSchema,
  GetIntermarketResonanceOutputSchema,
  GetSeasonalityOutputSchema,
  GetSessionLevelsOutputSchema,
  GetSocialSentimentOutputSchema,
  GetSystemDiagnosticsOutputSchema,
  ReplaySetupOutputSchema,
  RunSystemActionOutputSchema,
  SummarizeThreadOutputSchema,
  VerifyCallOutputSchema,
  WebSearchOutputSchema,
} from '@kestrel/shared';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

import { GetSessionLevelsPart } from '../get-session-levels';
import { RunSystemActionPart } from '../run-system-action';
import { SummarizeThreadPart } from '../summarize-thread';
import { VerifyCallPart } from '../verify-call';
import { PartSkeletonFallback } from './part-skeleton';
import type { PartRegistryMap, PartSchemaMap, ToolPartProps } from './types';

const ComputePositionHealthPart = dynamic(
  () => import('../compute-position-health').then((m) => m.ComputePositionHealthPart),
  { loading: PartSkeletonFallback },
) as ComponentType<ToolPartProps<'compute_position_health'>>;

const ComputeRiskPart = dynamic(() => import('../compute-risk').then((m) => m.ComputeRiskPart), {
  loading: PartSkeletonFallback,
}) as ComponentType<ToolPartProps<'compute_risk'>>;

const ConveneCommitteePart = dynamic(
  () => import('../convene-committee').then((m) => m.ConveneCommitteePart),
  { loading: PartSkeletonFallback },
) as ComponentType<ToolPartProps<'convene_committee'>>;

const ForecastVolatilityPart = dynamic(
  () => import('../forecast-volatility').then((m) => m.ForecastVolatilityPart),
  { loading: PartSkeletonFallback },
) as ComponentType<ToolPartProps<'forecast_volatility'>>;

const GetIntermarketPart = dynamic(
  () => import('../get-intermarket').then((m) => m.GetIntermarketPart),
  { loading: PartSkeletonFallback },
) as ComponentType<ToolPartProps<'get_intermarket'>>;

const GetIntermarketResonancePart = dynamic(
  () => import('../get-intermarket-resonance').then((m) => m.GetIntermarketResonancePart),
  { loading: PartSkeletonFallback },
) as ComponentType<ToolPartProps<'get_intermarket_resonance'>>;

const GetSeasonalityPart = dynamic(
  () => import('../get-seasonality').then((m) => m.GetSeasonalityPart),
  { loading: PartSkeletonFallback },
) as ComponentType<ToolPartProps<'get_seasonality'>>;

const GetSocialSentimentPart = dynamic(
  () => import('../get-social-sentiment').then((m) => m.GetSocialSentimentPart),
  { loading: PartSkeletonFallback },
) as ComponentType<ToolPartProps<'get_social_sentiment'>>;

const GetSystemDiagnosticsPart = dynamic(
  () => import('../get-system-diagnostics').then((m) => m.GetSystemDiagnosticsPart),
  { loading: PartSkeletonFallback },
) as ComponentType<ToolPartProps<'get_system_diagnostics'>>;

const ReplaySetupPart = dynamic(() => import('../replay-setup').then((m) => m.ReplaySetupPart), {
  loading: PartSkeletonFallback,
}) as ComponentType<ToolPartProps<'replay_setup'>>;

const WebSearchPart = dynamic(() => import('../web-search').then((m) => m.WebSearchPart), {
  loading: PartSkeletonFallback,
}) as ComponentType<ToolPartProps<'web_search'>>;

export type AdvancedTool =
  | 'compute_risk'
  | 'get_session_levels'
  | 'get_intermarket'
  | 'forecast_volatility'
  | 'get_seasonality'
  | 'compute_position_health'
  | 'replay_setup'
  | 'summarize_thread'
  | 'verify_call'
  | 'convene_committee'
  | 'get_intermarket_resonance'
  | 'get_system_diagnostics'
  | 'run_system_action'
  | 'get_social_sentiment'
  | 'web_search';

export const advancedParts = {
  registry: {
    compute_risk: ComputeRiskPart,
    get_session_levels: GetSessionLevelsPart,
    get_intermarket: GetIntermarketPart,
    forecast_volatility: ForecastVolatilityPart,
    get_seasonality: GetSeasonalityPart,
    compute_position_health: ComputePositionHealthPart,
    replay_setup: ReplaySetupPart,
    summarize_thread: SummarizeThreadPart,
    verify_call: VerifyCallPart,
    convene_committee: ConveneCommitteePart,
    get_intermarket_resonance: GetIntermarketResonancePart,
    get_system_diagnostics: GetSystemDiagnosticsPart,
    run_system_action: RunSystemActionPart,
    get_social_sentiment: GetSocialSentimentPart,
    web_search: WebSearchPart,
  } satisfies Pick<PartRegistryMap, AdvancedTool>,
  schemas: {
    compute_risk: ComputeRiskOutputSchema,
    get_session_levels: GetSessionLevelsOutputSchema,
    get_intermarket: GetIntermarketOutputSchema,
    forecast_volatility: ForecastVolatilityOutputSchema,
    get_seasonality: GetSeasonalityOutputSchema,
    compute_position_health: ComputePositionHealthOutputSchema,
    replay_setup: ReplaySetupOutputSchema,
    summarize_thread: SummarizeThreadOutputSchema,
    verify_call: VerifyCallOutputSchema,
    convene_committee: ConveneCommitteeOutputSchema,
    get_intermarket_resonance: GetIntermarketResonanceOutputSchema,
    get_system_diagnostics: GetSystemDiagnosticsOutputSchema,
    run_system_action: RunSystemActionOutputSchema,
    get_social_sentiment: GetSocialSentimentOutputSchema,
    web_search: WebSearchOutputSchema,
  } satisfies Pick<PartSchemaMap, AdvancedTool>,
};
