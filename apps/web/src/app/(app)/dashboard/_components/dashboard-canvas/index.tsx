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
} from '@dnd-kit/core';
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { IconAdjustmentsHorizontal, IconRotate } from '@tabler/icons-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-drawer';
import { PageHeader } from '@/components/layout/page-header';

import '@/lib/plugins/register-ui';

import { MissionControlDeck } from '../mission-control-deck';
import { PreSessionChecklistDrawer } from '../pre-session-checklist-drawer';
import { QuickLogTradeDrawer } from '../quick-log-trade-drawer';
import { AddWidgetMenu } from './add-widget-menu';
import { FetchErrorBanner } from './fetch-error-banner';
import { LayoutPresetsBar } from './layout-presets-bar';
import { SortableWidget } from './sortable-widget';
import type { DashboardCanvasProps } from './types';
import { useDashboardLayout } from './use-dashboard-layout';

export function DashboardCanvas({ ...props }: DashboardCanvasProps) {
  const {
    safeLayout,
    pluginWidgetByType,
    labelFor,
    hidden,
    persistLayout,
    handleDragEnd,
    addWidget,
    removeWidget,
    toggleSpan,
    resetLayout,
  } = useDashboardLayout(props.installedPluginIds);
  const [editMode, setEditMode] = useState(false);
  const [confirmEl, confirm] = useConfirm();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleReset() {
    const ok = await confirm({
      title: 'Reset dashboard layout?',
      description: 'All widgets will return to their default positions and sizes.',
      confirmLabel: 'Reset',
      tone: 'danger',
    });
    if (ok) resetLayout();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Single page header: title, description and every page-level action
          (checklist, log trade, layout customization) in one place. */}
      <PageHeader
        title="Overview"
        description="Live 4-desk command deck, session catalysts, and portfolio telemetry."
      >
        <div className="flex flex-wrap items-center gap-2">
          <PreSessionChecklistDrawer />
          <QuickLogTradeDrawer />
          {editMode && hidden.length > 0 ? (
            <AddWidgetMenu hidden={hidden} onAdd={addWidget} />
          ) : null}
          {editMode ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="font-mono text-xs active:translate-y-[0.5px]"
            >
              <IconRotate className="size-4" />
              Reset
            </Button>
          ) : null}
          <Button
            variant={editMode ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setEditMode((v) => !v)}
            aria-pressed={editMode}
            className="gap-1.5 font-mono text-xs font-semibold active:translate-y-[0.5px]"
          >
            <IconAdjustmentsHorizontal className="size-4" />
            {editMode ? 'Done Editing' : 'Customize Layout'}
          </Button>
        </div>
      </PageHeader>

      {/* Role Presets Bar when in Edit Mode */}
      {editMode && <LayoutPresetsBar onSelect={persistLayout} />}

      {/* Institutional Mission Control Deck */}
      <MissionControlDeck />

      {/* Phase 5.6 — Error banner for failed data fetches */}
      <FetchErrorBanner hasAnyError={props.hasAnyError} fetchErrors={props.fetchErrors} />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={safeLayout.map((w) => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-3.5 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
            {safeLayout.map((w) => (
              <SortableWidget
                key={w.id}
                widget={w}
                label={labelFor(w.type)}
                pluginWidgetByType={pluginWidgetByType}
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
