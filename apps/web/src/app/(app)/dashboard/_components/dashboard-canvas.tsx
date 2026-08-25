// SPDX-License-Identifier: Apache-2.0

'use client';

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

// Phase 1.6 — Modular customizable dashboard canvas.
//
// A dnd-kit-powered grid that maps the persisted `WidgetConfig[]`
// layout to concrete widget components. The layout is stored in
// `localStorage` (key from `widget-types.ts`) so it survives reloads
// without a server round-trip.
//
// Features:
//   - Drag to reorder via the dnd-kit `SortableContext`.
//   - Per-widget span toggle (1↔2 columns).
//   - Per-widget remove (re-add via the "Add widget" dropdown).
//   - Persist on every change.
//   - "Customize" toggle exposes the chrome; default = clean view.
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Alert, EconomicEvent, JournalEntry, NewsArticle, Symbol } from '@kestrel/shared';
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconGripVertical,
  IconPlus,
  IconRotate,
  IconX,
} from '@tabler/icons-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { cn } from '@/lib/cn';


import { PreSessionChecklistDrawer } from './pre-session-checklist-drawer';
import { QuickLogTradeDrawer } from './quick-log-trade-drawer';
import {
  DEFAULT_LAYOUT,
  LAYOUT_STORAGE_KEY,
  PRESET_LAYOUTS,
  WIDGET_LABELS,
  type LayoutPresetName,
  type WidgetConfig,
  type WidgetType,
} from './widget-types';
import { AlertsWidget } from './widgets/alerts-widget';
import { BriefingWidget } from './widgets/briefing-widget';
import { CalendarWidget } from './widgets/calendar-widget';
import { EquityCurveWidget } from './widgets/equity-curve-widget';
import { NewsPulseWidget } from './widgets/news-pulse-widget';
import { OpenPositionsWidget } from './widgets/open-positions-widget';
import { PnLHeatmapWidget } from './widgets/pnl-heatmap-widget';
import { QuantDeskWidget } from './widgets/quant-desk-widget';
import { StatsWidget } from './widgets/stats-widget';
import { TodayGlanceWidget } from './widgets/today-glance-widget';
import { WatchlistWidget } from './widgets/watchlist-widget';

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

interface DashboardCanvasProps {
  alerts: readonly Alert[];
  events: readonly EconomicEvent[];
  entries: readonly JournalEntry[];
  news: readonly NewsArticle[];
  briefing: BriefingData;
  /** Portfolio margin usage percentage for the leverage gauge. */
  marginUsagePct?: number;
  /** Formatted detail string for the leverage gauge, e.g. "$12,450 / $50,000". */
  marginDetail?: string | null;
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
}

const ALL_WIDGETS: WidgetType[] = [
  'today-glance',
  'briefing',
  'quant-desk',
  'pnl-heatmap',
  'equity-curve',
  'stats',
  'watchlist',
  'open-positions',
  'alerts',
  'calendar',
  'news-pulse',
];


export function DashboardCanvas({ ...props }: DashboardCanvasProps) {
  const [layout, setLayout, hydrated] = useLocalStorage<WidgetConfig[]>(
    LAYOUT_STORAGE_KEY,
    DEFAULT_LAYOUT,
  );
  const [editMode, setEditMode] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  // After hydration, prune any widget types that no longer exist in the
  // catalogue (forward-compat).
  const safeLayout = useMemo(() => {
    if (!hydrated) return DEFAULT_LAYOUT;
    const known = new Set<WidgetType>(ALL_WIDGETS);
    return layout.filter((w) => known.has(w.type)).map((w, i) => ({ ...w, order: i }));
  }, [hydrated, layout]);

  const persistLayout = useCallback(
    (next: WidgetConfig[]) => {
      const reStamped = next.map((w, i) => ({ ...w, order: i }));
      setLayout(reStamped);
    },
    [setLayout],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = safeLayout.findIndex((w) => w.id === active.id);
    const newIndex = safeLayout.findIndex((w) => w.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    persistLayout(arrayMove(safeLayout, oldIndex, newIndex));
  }

  function removeWidget(id: string) {
    persistLayout(safeLayout.filter((w) => w.id !== id));
  }

  function toggleSpan(id: string) {
    persistLayout(
      safeLayout.map((w) => {
        if (w.id !== id) return w;
        const nextSpan: 1 | 2 | 3 = w.span === 1 ? 2 : w.span === 2 ? 3 : 1;
        return { ...w, span: nextSpan };
      }),
    );
  }

  function resetLayout() {
    persistLayout(DEFAULT_LAYOUT);
  }

  async function handleReset() {
    const ok = await confirm({
      title: 'Reset dashboard layout?',
      description: 'All widgets will return to their default positions and sizes.',
      confirmLabel: 'Reset',
      tone: 'danger',
    });
    if (ok) resetLayout();
  }

  const hidden = ALL_WIDGETS.filter((t) => !safeLayout.some((w) => w.type === t));

  return (
    <div className="flex flex-col gap-4">
      {/* Top Header & Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-fg text-xl font-bold tracking-tight">Dashboard</h1>
            <PreSessionChecklistDrawer />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <QuickLogTradeDrawer />
            {editMode && hidden.length > 0 ? (
              <AddWidgetMenu
                hidden={hidden}
                onAdd={(type) => {
                  persistLayout([
                    ...safeLayout,
                    {
                      id: `w-${type}-${Math.random().toString(36).slice(2, 8)}`,
                      type,
                      span: 1,
                      order: safeLayout.length,
                    },
                  ]);
                }}
              />
            ) : null}
            {editMode ? (
              <Button variant="ghost" size="sm" onClick={handleReset}>
                <IconRotate className="size-4" />
                Reset
              </Button>
            ) : null}
            <Button
              variant={editMode ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setEditMode((v) => !v)}
              aria-pressed={editMode}
              className="gap-1.5 font-semibold"
            >
              <IconAdjustmentsHorizontal className="size-4" />
              {editMode ? 'Done Editing' : 'Customize Layout'}
            </Button>
          </div>
        </div>

        {/* Role Presets Bar when in Edit Mode */}
        {editMode && (
          <div className="border-brand/40 bg-bg-elev-1 animate-in fade-in flex flex-col gap-2 rounded-sm border p-3 duration-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-caption text-brand font-mono font-bold tracking-wider uppercase">
                ⚡ Role Layout Presets
              </span>
              <span className="text-fg-subtle text-[11px]">
                Click a preset to instantly restructure your workspace
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(PRESET_LAYOUTS) as LayoutPresetName[]).map((key) => {
                const preset = PRESET_LAYOUTS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      persistLayout(preset.layout);
                    }}
                    className="border-border bg-bg-elev-2 text-fg hover:border-brand hover:text-brand inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer touch-manipulation"
                    title={preset.description}
                  >
                    <span>{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>


      {/* Phase 5.6 — Error banner for failed data fetches */}
      {props.hasAnyError ? (
        <div
          className="border-warn/30 bg-warn/5 flex items-center gap-3 rounded-sm border px-4 py-2.5 text-sm"
          role="alert"
        >
          <IconAlertTriangle className="text-warn size-4 shrink-0" />
          <span className="text-fg-subtle">
            Some dashboard data failed to load. Try{' '}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-fg underline hover:no-underline"
            >
              refreshing
            </button>
            .
            {props.fetchErrors && (
              <span className="text-fg-muted ml-2 text-xs">
                (
                {Object.entries(props.fetchErrors)
                  .filter(([, v]) => v)
                  .map(([k]) => k)
                  .join(', ')}
                )
              </span>
            )}
          </span>
        </div>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={safeLayout.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-3.5 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
            {safeLayout.map((w) => (
              <SortableWidget
                key={w.id}
                widget={w}
                editMode={editMode}
                onRemove={() => removeWidget(w.id)}
                onToggleSpan={() => toggleSpan(w.id)}
                {...props}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {confirmEl}
    </div>
  );
}


// ---------------------------------------------------------------------------
// SortableWidget — wraps each widget in a chrome card with the drag handle,
// span toggle, and remove button when in edit mode. The actual widget body
// is rendered via `renderWidget()`.
// ---------------------------------------------------------------------------

interface SortableWidgetProps extends DashboardCanvasProps {
  widget: WidgetConfig;
  editMode: boolean;
  onRemove: () => void;
  onToggleSpan: () => void;
}

function SortableWidget({
  widget,
  editMode,
  onRemove,
  onToggleSpan,
  ...data
}: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        widget.span === 3 && 'col-span-1 md:col-span-2 lg:col-span-3',
        widget.span === 2 && 'col-span-1 md:col-span-2 lg:col-span-2',
        widget.span === 1 && 'col-span-1',
        editMode && 'ring-border rounded-sm ring-1',
      )}
    >
      {editMode ? (
        <div className="border-border bg-bg-elev-1 mb-1 flex items-center justify-between gap-2 rounded-sm border px-3 py-1.5">
          <button
            type="button"
            aria-label={`Drag ${WIDGET_LABELS[widget.type]} widget`}
            className="text-fg-subtle hover:text-fg cursor-grab touch-none active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <IconGripVertical className="size-4" />
          </button>
          <span className="text-fg-subtle text-caption tracking-wider uppercase">
            {WIDGET_LABELS[widget.type]}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={`Toggle span for ${WIDGET_LABELS[widget.type]}`}
              onClick={onToggleSpan}
              className="text-fg-subtle hover:text-fg bg-bg-elev-2 border-border/80 rounded-xs border px-1.5 py-0.5 font-mono text-[11px]"
              title={`Current span: ${widget.span}/3 columns (click to cycle)`}
            >
              {widget.span}/3 col
            </button>
            <button
              type="button"
              aria-label={`Remove ${WIDGET_LABELS[widget.type]}`}
              onClick={onRemove}
              className="text-fg-subtle hover:text-danger p-0.5"
            >
              <IconX className="size-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="h-full">{renderWidget(widget.type, data)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// renderWidget — maps a widget type to its concrete component. Keeps the
// chrome (`SortableWidget`) decoupled from individual widget APIs.
// ---------------------------------------------------------------------------

function renderWidget(type: WidgetType, data: Omit<DashboardCanvasProps, never>) {
  const { alerts, events, entries, news, briefing } = data;

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

// ---------------------------------------------------------------------------
// AddWidgetMenu — small popover that lists widget types not currently on
// the canvas. We use a native <details>/<summary> for simplicity so we
// don't pull in another popover primitive.
// ---------------------------------------------------------------------------

function AddWidgetMenu({
  hidden,
  onAdd,
}: {
  hidden: WidgetType[];
  onAdd: (type: WidgetType) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        ref.current.open = false;
      }
    }
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  if (hidden.length === 0) return null;
  return (
    <details ref={ref} className="relative">
      <summary
        className="border-border bg-bg-elev-1 hover:bg-bg-elev-2 text-fg text-caption inline-flex cursor-pointer list-none items-center gap-1 rounded-sm border px-2 py-1"
        aria-label="Add widget"
      >
        <IconPlus className="size-3.5" />
        Add widget
      </summary>
      <div className="border-border bg-bg-elev-1 absolute right-0 z-10 mt-1 flex min-w-[180px] flex-col rounded-sm border p-1 shadow-lg">
        {hidden.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onAdd(t)}
            className="text-fg hover:bg-bg-elev-2 text-caption rounded-sm px-2 py-1 text-left"
          >
            {WIDGET_LABELS[t]}
          </button>
        ))}
      </div>
    </details>
  );
}
