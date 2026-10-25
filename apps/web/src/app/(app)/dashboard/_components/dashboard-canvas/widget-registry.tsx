'use client';

// SPDX-License-Identifier: Apache-2.0

// renderWidget — maps a widget type to its concrete component. Keeps the
// chrome (`SortableWidget`) decoupled from individual widget APIs.
import type { RegisteredDashboardWidget } from '@kestrel/plugin-sdk/ui';
import type { Symbol } from '@kestrel/shared';
import { IconPuzzle } from '@tabler/icons-react';
import { memo } from 'react';

import { isPluginWidgetType, parsePluginWidgetType, type WidgetType } from '../widget-types';
import { AlertsWidget } from '../widgets/alerts-widget';
import { BriefingWidget } from '../widgets/briefing-widget';
import { CalendarWidget } from '../widgets/calendar-widget';
import { EquityCurveWidget } from '../widgets/equity-curve-widget';
import { NewsPulseWidget } from '../widgets/news-pulse-widget';
import { OpenPositionsWidget } from '../widgets/open-positions-widget';
import { PnLHeatmapWidget } from '../widgets/pnl-heatmap-widget';
import { QuantDeskWidget } from '../widgets/quant-desk-widget';
import { StatsWidget } from '../widgets/stats-widget';
import { TodayGlanceWidget } from '../widgets/today-glance-widget';
import { WatchlistWidget } from '../widgets/watchlist-widget';
import type { DashboardCanvasProps } from './types';

const MemoTodayGlance = memo(TodayGlanceWidget);
const MemoBriefing = memo(BriefingWidget);
const MemoQuantDesk = memo(QuantDeskWidget);
const MemoHeatmap = memo(PnLHeatmapWidget);
const MemoEquityCurve = memo(EquityCurveWidget);
const MemoStats = memo(StatsWidget);
const MemoWatchlist = memo(WatchlistWidget);
const MemoOpenPositions = memo(OpenPositionsWidget);
const MemoAlerts = memo(AlertsWidget);
const MemoCalendar = memo(CalendarWidget);
const MemoNewsPulse = memo(NewsPulseWidget);

function PluginWidgetUnavailable() {
  return (
    <div className="border-border/60 bg-bg-elev-1/40 flex h-full min-h-32 flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-4 text-center">
      <IconPuzzle className="text-fg-subtle size-5" />
      <p className="text-fg text-xs font-semibold">Plugin widget unavailable</p>
      <p className="text-fg-subtle text-[11px]">
        Reinstall or enable its plugin, then add it again from Customize Layout.
      </p>
    </div>
  );
}

export function renderWidget(
  type: WidgetType,
  data: DashboardCanvasProps,
  pluginWidgetByType: ReadonlyMap<string, RegisteredDashboardWidget>,
) {
  const { alerts, events, entries, news, briefing } = data;

  if (isPluginWidgetType(type)) {
    const registered = pluginWidgetByType.get(type);
    if (!registered) return <PluginWidgetUnavailable />;
    const Widget = registered.widget.component;
    const parsed = parsePluginWidgetType(type);
    return (
      <Widget
        pluginId={registered.pluginId}
        settings={data.pluginSettings?.[parsed?.pluginId ?? registered.pluginId] ?? {}}
      />
    );
  }

  const briefingNudge = briefing?.body?.split('. ')[0] ?? null;

  switch (type) {
    case 'today-glance':
      return (
        <MemoTodayGlance
          events={[...events]}
          entries={[...entries]}
          briefingNudge={briefingNudge}
          defaultSymbol={(briefing?.symbol as Symbol | undefined) ?? 'XAUUSD'}
        />
      );
    case 'briefing':
      return <MemoBriefing briefing={briefing} />;
    case 'quant-desk':
      return <MemoQuantDesk />;
    case 'pnl-heatmap':
      return <MemoHeatmap entries={entries} />;

    case 'equity-curve':
      return <MemoEquityCurve entries={entries} />;
    case 'stats':
      return <MemoStats entries={entries} />;
    case 'watchlist':
      return <MemoWatchlist />;
    case 'open-positions':
      return <MemoOpenPositions entries={entries} />;
    case 'alerts':
      return <MemoAlerts alerts={alerts} />;
    case 'calendar':
      return <MemoCalendar events={events} />;
    case 'news-pulse':
      return <MemoNewsPulse articles={news} />;
  }
}
