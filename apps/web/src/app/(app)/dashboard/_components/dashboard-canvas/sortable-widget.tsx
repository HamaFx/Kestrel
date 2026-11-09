'use client';

// SPDX-License-Identifier: Apache-2.0

// SortableWidget — one cell of the hairline Bento matrix. In edit mode a
// floating glass HUD (drag handle, label, span cycle, remove) sits inside the
// cell so the grid geometry never shifts by a single pixel.
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { RegisteredDashboardWidget } from '@kestrel/plugin-sdk/ui';
import { IconGripVertical, IconX } from '@tabler/icons-react';

import { cn } from '@/lib/formatters/cn';

import type { WidgetConfig } from '../widget-types';
import type { DashboardCanvasProps } from './types';
import { renderWidget } from './widget-registry';

interface SortableWidgetProps extends DashboardCanvasProps {
  widget: WidgetConfig;
  label: string;
  pluginWidgetByType: ReadonlyMap<string, RegisteredDashboardWidget>;
  editMode: boolean;
  onRemove: () => void;
  onToggleSpan: () => void;
}

export function SortableWidget({
  widget,
  label,
  pluginWidgetByType,
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
        'relative h-full min-h-[180px] bg-[#121315]',
        widget.span === 3 && 'col-span-1 md:col-span-2 lg:col-span-3',
        widget.span === 2 && 'col-span-1 md:col-span-2 lg:col-span-2',
        widget.span === 1 && 'col-span-1',
        editMode && 'z-10 ring-1 ring-brand/45 ring-inset',
      )}
    >
      {editMode ? (
        <div className="border-brand/40 absolute top-2.5 right-2.5 z-20 flex items-center gap-1 rounded-lg border bg-[#121315]/95 px-1.5 py-1 shadow-xl backdrop-blur-md">
          <button
            type="button"
            aria-label={`Drag ${label} widget`}
            className="text-fg-subtle hover:text-fg inline-flex size-8 min-h-8 min-w-8 cursor-grab touch-none items-center justify-center rounded-md transition-colors active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <IconGripVertical className="size-3.5" />
          </button>
          <span className="text-brand max-w-24 truncate font-mono text-[9px] font-semibold tracking-wider uppercase">
            {label}
          </span>
          <button
            type="button"
            aria-label={`Cycle span for ${label}`}
            onClick={onToggleSpan}
            className="text-fg-muted hover:text-brand inline-flex min-h-8 items-center justify-center rounded-md px-1.5 font-mono text-[9px] font-semibold tabular-nums transition-colors"
            title={`Current span: ${widget.span}x (click to cycle 1x / 2x / 3x)`}
          >
            {widget.span}x
          </button>
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={onRemove}
            className="text-fg-subtle hover:bg-danger/10 hover:text-danger inline-flex size-8 min-h-8 min-w-8 items-center justify-center rounded-md transition-colors"
          >
            <IconX className="size-3.5" />
          </button>
        </div>
      ) : null}

      <div className="h-full [&>.surface-card]:h-full [&>.surface-card]:rounded-none [&>.surface-card]:border-0 [&>.surface-card]:bg-[#121315] [&>.surface-card]:shadow-none">
        {renderWidget(widget.type, data, pluginWidgetByType)}
      </div>
    </div>
  );
}
