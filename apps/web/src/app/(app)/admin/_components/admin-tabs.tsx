'use client';

// SPDX-License-Identifier: Apache-2.0

// Admin section registry: lazy-loaded section chunks with their labels and
// icons, plus the tab-id guards used by the route.
import {
  IconBug,
  IconCpu,
  IconDatabase,
  IconFlag,
  IconFlask,
  IconHeartbeat,
  IconHistory,
  IconMessageReport,
  IconRefresh,
  IconSettingsBolt,
  IconStethoscope,
  IconTerminal,
  IconTool,
  IconUsers,
} from '@tabler/icons-react';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

import { AdminTabFallback } from './admin-tab-fallback';

const AdminPlatformConfig = dynamic(
  () => import('./admin-platform-config').then((m) => m.AdminPlatformConfig),
  { loading: AdminTabFallback },
) as ComponentType;

const AdminSystemHealth = dynamic(
  () => import('./admin-system-health').then((m) => m.AdminSystemHealth),
  { loading: AdminTabFallback },
) as ComponentType;

const AdminOnboardingControl = dynamic(
  () => import('./admin-onboarding-control').then((m) => m.AdminOnboardingControl),
  { loading: AdminTabFallback },
) as ComponentType;

const AdminCronTable = dynamic(() => import('./admin-cron-table').then((m) => m.AdminCronTable), {
  loading: AdminTabFallback,
}) as ComponentType;

const AdminToolTelemetryTable = dynamic(
  () => import('./admin-tool-telemetry-table').then((m) => m.AdminToolTelemetryTable),
  { loading: AdminTabFallback },
) as ComponentType;

const AdminDiagnosticTraces = dynamic(
  () => import('./admin-diagnostic-traces').then((m) => m.AdminDiagnosticTraces),
  { loading: AdminTabFallback },
) as ComponentType;

const AdminUserTable = dynamic(() => import('./admin-user-table').then((m) => m.AdminUserTable), {
  loading: AdminTabFallback,
}) as ComponentType;

const AdminFeatureFlags = dynamic(
  () => import('./admin-feature-flags').then((m) => m.AdminFeatureFlags),
  { loading: AdminTabFallback },
) as ComponentType;

const AdminLogViewer = dynamic(() => import('./admin-log-viewer').then((m) => m.AdminLogViewer), {
  loading: AdminTabFallback,
}) as ComponentType;

const AdminDevTools = dynamic(() => import('./admin-dev-tools').then((m) => m.AdminDevTools), {
  loading: AdminTabFallback,
}) as ComponentType;

const AdminAuditTable = dynamic(
  () => import('./admin-audit-table').then((m) => m.AdminAuditTable),
  { loading: AdminTabFallback },
) as ComponentType;

const AdminFeedbackReview = dynamic(
  () => import('./admin-feedback-review').then((m) => m.AdminFeedbackReview),
  { loading: AdminTabFallback },
) as ComponentType;

const AdminDatasetReview = dynamic(
  () => import('./admin-dataset-review').then((m) => m.AdminDatasetReview),
  { loading: AdminTabFallback },
) as ComponentType;

const AdminRegressionCases = dynamic(
  () => import('./admin-regression-cases').then((m) => m.AdminRegressionCases),
  { loading: AdminTabFallback },
) as ComponentType;

const AdminAiEval = dynamic(() => import('./admin-ai-eval').then((m) => m.AdminAiEval), {
  loading: AdminTabFallback,
}) as ComponentType;

const AdminMastraRuns = dynamic(
  () => import('./admin-mastra-runs').then((m) => m.AdminMastraRuns),
  { loading: AdminTabFallback },
) as ComponentType;

export const TABS = [
  { id: 'platform', label: 'AI & Platform', icon: IconCpu, Component: AdminPlatformConfig },
  { id: 'health', label: 'Health', icon: IconHeartbeat, Component: AdminSystemHealth },
  { id: 'users', label: 'Users', icon: IconUsers, Component: AdminUserTable },
  { id: 'features', label: 'Features', icon: IconFlag, Component: AdminFeatureFlags },
  { id: 'onboarding', label: 'Onboarding', icon: IconRefresh, Component: AdminOnboardingControl },
  { id: 'cron', label: 'Cron', icon: IconHistory, Component: AdminCronTable },
  { id: 'telemetry', label: 'Telemetry', icon: IconTool, Component: AdminToolTelemetryTable },
  { id: 'traces', label: 'Traces', icon: IconStethoscope, Component: AdminDiagnosticTraces },
  { id: 'logs', label: 'Logs', icon: IconTerminal, Component: AdminLogViewer },
  { id: 'audit', label: 'Audit', icon: IconHistory, Component: AdminAuditTable },
  { id: 'feedback', label: 'Feedback', icon: IconMessageReport, Component: AdminFeedbackReview },
  { id: 'datasets', label: 'Datasets', icon: IconDatabase, Component: AdminDatasetReview },
  { id: 'regressions', label: 'Regressions', icon: IconBug, Component: AdminRegressionCases },
  { id: 'ai-eval', label: 'AI Eval', icon: IconFlask, Component: AdminAiEval },
  { id: 'mastra-runs', label: 'Committee Runs', icon: IconStethoscope, Component: AdminMastraRuns },
  { id: 'devtools', label: 'Dev Tools', icon: IconSettingsBolt, Component: AdminDevTools },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export const TAB_IDS: readonly string[] = TABS.map((t) => t.id);
export const DEFAULT_TAB: TabId = 'platform';
export const TAB_PARAM = 'tab';

export function isValidTab(id: string | null): id is TabId {
  return !!id && TAB_IDS.includes(id);
}
