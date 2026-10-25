// SPDX-License-Identifier: Apache-2.0

// Props shared by the dashboard canvas shell, its sortable widget chrome, and
// the widget registry.
import type { Alert, EconomicEvent, JournalEntry, NewsArticle } from '@kestrel/shared';

type BriefingData = {
  messageId: string;
  createdAt: number;
  body: string;
  kind: 'pre' | 'post' | 'weekly_review';
  summary: string;
  eventTitle: string | null;
  eventDate: number | null;
  symbol: string | null;
} | null;

export interface DashboardCanvasProps {
  alerts: readonly Alert[];
  events: readonly EconomicEvent[];
  entries: readonly JournalEntry[];
  news: readonly NewsArticle[];
  briefing: BriefingData;
  /** Phase 5.6 — per-source error messages; null means fetch succeeded. */
  fetchErrors?: {
    alerts: string | null;
    events: string | null;
    entries: string | null;
    news: string | null;
    briefing: string | null;
    risk?: string | null;
    settings?: string | null;
  };
  hasAnyError?: boolean;
  /** Installed plugin ids whose dashboard widgets may be mounted. */
  installedPluginIds?: readonly string[];
  /** Masked plugin settings, keyed by plugin id (secrets never reach the browser). */
  pluginSettings?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}
