// SPDX-License-Identifier: Apache-2.0

// Dashboard layout state: the persisted widget list, the plugin widget
// catalogue, catalogue pruning, and the add/remove/span/order mutations.
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { pluginUiRegistry, type RegisteredDashboardWidget } from '@kestrel/plugin-sdk/ui';
import { useCallback, useMemo } from 'react';

import { useLocalStorage } from '@/hooks/use-local-storage';

import {
  CORE_WIDGET_TYPES,
  DEFAULT_LAYOUT,
  isPluginWidgetType,
  LAYOUT_STORAGE_KEY,
  makePluginWidgetType,
  WIDGET_LABELS,
  type WidgetConfig,
  type WidgetType,
} from '../widget-types';

export function useDashboardLayout(installedPluginIds?: readonly string[]) {
  const [layout, setLayout, hydrated] = useLocalStorage<WidgetConfig[]>(
    LAYOUT_STORAGE_KEY,
    DEFAULT_LAYOUT,
  );

  const installedPluginKey = (installedPluginIds ?? []).join(',');
  const pluginWidgets = useMemo(
    () => pluginUiRegistry.listDashboardWidgets(installedPluginIds ?? []),
    // The joined key avoids re-listing when the parent re-renders with a
    // freshly serialised but equivalent array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installedPluginKey],
  );

  const pluginWidgetByType = useMemo<ReadonlyMap<string, RegisteredDashboardWidget>>(
    () =>
      new Map(
        pluginWidgets.map((entry) => [
          makePluginWidgetType(entry.pluginId, entry.widget.id),
          entry,
        ]),
      ),
    [pluginWidgets],
  );

  const labelFor = useCallback(
    (type: WidgetType): string => {
      if (isPluginWidgetType(type)) {
        return pluginWidgetByType.get(type)?.widget.title ?? 'Plugin widget';
      }
      return WIDGET_LABELS[type];
    },
    [pluginWidgetByType],
  );

  // After hydration, prune any widget types that no longer exist in the
  // catalogue (core widget removed, or plugin uninstalled).
  const safeLayout = useMemo(() => {
    if (!hydrated) return DEFAULT_LAYOUT;
    const known = new Set<string>([...CORE_WIDGET_TYPES, ...pluginWidgetByType.keys()]);
    return layout.filter((w) => known.has(w.type)).map((w, i) => ({ ...w, order: i }));
  }, [hydrated, layout, pluginWidgetByType]);

  const persistLayout = useCallback(
    (next: WidgetConfig[]) => {
      const reStamped = next.map((w, i) => ({ ...w, order: i }));
      setLayout(reStamped);
    },
    [setLayout],
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = safeLayout.findIndex((w) => w.id === active.id);
    const newIndex = safeLayout.findIndex((w) => w.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    persistLayout(arrayMove(safeLayout, oldIndex, newIndex));
  }

  function addWidget(type: WidgetType) {
    persistLayout([
      ...safeLayout,
      {
        id: `w-${type}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        span: 1,
        order: safeLayout.length,
      },
    ]);
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

  const hidden: Array<{ type: WidgetType; label: string }> = [
    ...CORE_WIDGET_TYPES.filter((type) => !safeLayout.some((w) => w.type === type)).map((type) => ({
      type,
      label: WIDGET_LABELS[type],
    })),
    ...pluginWidgets
      .map((entry) => ({
        type: makePluginWidgetType(entry.pluginId, entry.widget.id),
        label: entry.widget.title,
      }))
      .filter((entry) => !safeLayout.some((w) => w.type === entry.type)),
  ];

  return {
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
  };
}
