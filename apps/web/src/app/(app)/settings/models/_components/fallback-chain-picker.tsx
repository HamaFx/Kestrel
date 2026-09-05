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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ProviderMeta } from '@kestrel/shared';
import {
  IconAlertTriangle,
  IconGripVertical,
  IconLoader2,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { apiMutate } from '@/lib/api-client';

interface FallbackChainPickerProps {
  initialChain: string[];
  configuredProviders: ProviderMeta[];
}

function SortableItem({
  id,
  index,
  displayName,
  disabled,
  onRemove,
}: {
  id: string;
  index: number;
  displayName: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-bg-elev-2 flex items-center justify-between gap-3 rounded-sm border p-2.5 transition-all ${
        isDragging ? 'border-border z-10 opacity-90 shadow-lg' : 'border-border hover:border-border'
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className="text-fg-muted hover:text-fg flex size-10 min-h-10 min-w-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-md active:cursor-grabbing tactile-press transition-colors"
          aria-label={`Drag to reorder ${displayName}`}
          {...attributes}
          {...listeners}
        >
          <IconGripVertical className="size-3.5" />
        </button>
        <span className="text-caption bg-bg-elev-3 border-border text-fg-muted inline-flex size-5 shrink-0 items-center justify-center rounded-sm border font-semibold">
          {index + 1}
        </span>
        <span className="text-fg truncate text-sm font-medium">{displayName}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        disabled={disabled}
        className="text-danger hover:bg-danger/10 hover:text-danger flex size-10 min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md p-0 tactile-press"
        aria-label={`Remove ${displayName} from chain`}
      >
        <IconTrash className="size-3.5" />
      </Button>
    </div>
  );
}

export function FallbackChainPicker({
  initialChain,
  configuredProviders,
}: FallbackChainPickerProps) {
  const [chain, setChain] = useState<string[]>(initialChain);
  const [pending, startTransition] = useTransition();
  const [selectedToAdd, setSelectedToAdd] = useState<string>('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function saveChain(newChain: string[]) {
    setChain(newChain);
    startTransition(async () => {
      try {
        await apiMutate('/api/settings/fallback-chain', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fallbackChain: newChain }),
        });
        toast.success('Fallback chain updated');
      } catch {
        toast.error('Failed to update fallback chain');
        setChain(chain);
      }
    });
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = chain.indexOf(String(active.id));
    const newIndex = chain.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newChain = arrayMove(chain, oldIndex, newIndex);
    saveChain(newChain);
  };

  const handleAdd = () => {
    if (!selectedToAdd || chain.includes(selectedToAdd)) return;
    const newChain = [...chain, selectedToAdd];
    saveChain(newChain);
    setSelectedToAdd('');
  };

  const handleRemove = (index: number) => {
    const newChain = chain.filter((_, i) => i !== index);
    saveChain(newChain);
  };

  const availableToAdd = configuredProviders.filter((p) => !chain.includes(p.id));

  return (
    <div className="border-border bg-bg-elev-1 flex flex-col gap-4 rounded-sm border p-4">
      <div className="flex flex-col gap-1">
        <span className="text-fg flex items-center gap-1.5 text-sm font-medium">
          <IconAlertTriangle className="text-fg size-4" />
          Provider Fallback Chain
        </span>
        <span className="text-caption text-fg-subtle">
          Drag to reorder. Configure the order in which providers are tried if your primary choice
          encounters a rate limit, timeout, or upstream failure.
        </span>
      </div>

      {chain.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={chain} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {chain.map((providerId, index) => {
                const provider = configuredProviders.find((p) => p.id === providerId);
                const displayName = provider?.displayName ?? providerId;
                return (
                  <SortableItem
                    key={providerId}
                    id={providerId}
                    index={index}
                    displayName={displayName}
                    disabled={pending}
                    onRemove={() => handleRemove(index)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="border-border bg-bg-elev-2/40 text-caption text-fg-subtle rounded-sm border border-dashed py-6 text-center">
          No fallback chain configured. If a model call fails, the request will immediately fail.
        </div>
      )}

      {availableToAdd.length > 0 && (
        <div className="mt-1 flex items-center gap-2">
          <select
            value={selectedToAdd}
            onChange={(e) => setSelectedToAdd(e.target.value)}
            disabled={pending}
            aria-label="Select a provider to add to fallback chain"
            className="border-border bg-bg-elev-2 text-fg focus:ring-fg flex-1 appearance-none rounded-sm border px-3 py-2 text-sm focus:ring-2 focus:outline-none disabled:opacity-60"
          >
            <option value="" disabled>
              Select a provider to append...
            </option>
            {availableToAdd.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAdd}
            disabled={!selectedToAdd || pending}
            className="shrink-0"
          >
            {pending ? (
              <IconLoader2 className="size-3.5 animate-spin" />
            ) : (
              <IconPlus className="mr-1 size-3.5" />
            )}
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
