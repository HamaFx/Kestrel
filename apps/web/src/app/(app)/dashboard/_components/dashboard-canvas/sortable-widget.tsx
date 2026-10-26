'use client';

// SPDX-License-Identifier: Apache-2.0

// SortableWidget — wraps each widget in a chrome card with the drag handle,
// span toggle, and remove button when in edit mode. The actual widget body
// is rendered via `renderWidget()`.
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
        widget.span === 3 && 'col-span-1 md:col-span-2 lg:col-span-3',
        widget.span === 2 && 'col-span-1 md:col-span-2 lg:col-span-2',
        widget.span === 1 && 'col-span-1',
        editMode && 'ring-1 ring-brand/40 rounded-2xl',
      )}
    >
      {editMode ? (
        <div className="bg-bg-elev-1/90 mb-1.5 flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] px-3 py-2 shadow-sm backdrop-blur-md">
          <button
            type="button"
            aria-label={`Drag ${label} widget`}
            className="inline-flex size-10 min-h-10 min-w-10 cursor-grab touch-none items-center justify-center rounded-md text-fg-subtle transition-colors hover:text-fg active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <IconGripVertical className="size-4" />
          </button>
          <span className="font-mono text-[11px] font-semibold tracking-wider text-brand uppercase">
            {label}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={`Toggle span for ${label}`}
              onClick={onToggleSpan}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-white/[0.08] bg-bg-elev-2 px-3 py-2 font-mono text-xs text-fg transition-colors hover:border-brand/40 hover:text-brand active:translate-y-[0.5px]"
              title={`Current span: ${widget.span === 1 ? 'Compact' : widget.span === 2 ? 'Wide' : 'Full Width'} (click to cycle)`}
            >
              {widget.span === 1 ? 'Compact' : widget.span === 2 ? 'Wide' : 'Full Width'}
            </button>
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={onRemove}
              className="text-fg-subtle hover:bg-danger/10 hover:text-danger inline-flex size-10 min-h-10 min-w-10 items-center justify-center rounded-md transition-colors active:translate-y-[0.5px]"
            >
              <IconX className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="h-full">{renderWidget(widget.type, data, pluginWidgetByType)}</div>
    </div>
  );
}
