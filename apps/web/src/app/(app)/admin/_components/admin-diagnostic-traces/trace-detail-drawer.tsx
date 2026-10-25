'use client';

// SPDX-License-Identifier: Apache-2.0

// Trace-detail drawer shell: header, loading/error/empty branches, and the
// detail blocks for the selected trace.
import { IconStethoscope, IconTimeline, IconX } from '@tabler/icons-react';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonCard } from '@/components/ui/skeleton';
import type { DiagnosticTraceDetail, TraceExplorerEvent } from '@/lib/services/admin-dtos';

import { TraceDetailSections, TraceDetailSummary } from './trace-detail-sections';
import { copyToClipboard } from './trace-format';

interface TraceDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  detail: DiagnosticTraceDetail | null;
  events: TraceExplorerEvent[];
}

export function TraceDetailDrawer({
  open,
  onClose,
  loading,
  error,
  detail,
  events,
}: TraceDetailDrawerProps) {
  const handleCopy = useCallback(async (text: string, label: string) => {
    await copyToClipboard(text);
    toast.success(`${label} copied to clipboard`);
  }, []);

  return (
    <Drawer open={open} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[92vh] overflow-y-auto">
        <DrawerHeader className="flex items-start justify-between">
          <div>
            <DrawerTitle className="flex items-center gap-2">
              <IconTimeline className="size-5" aria-hidden="true" />
              Trace detail
            </DrawerTitle>
            <DrawerDescription>
              Steps, timings, correlated events, and errors for this chat turn.
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0"
              aria-label="Close trace detail"
            >
              <IconX className="size-4" aria-hidden="true" />
            </Button>
          </DrawerClose>
        </DrawerHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          {loading ? (
            <SkeletonCard lines={5} />
          ) : error ? (
            <div className="border-border bg-bg-elev-1 rounded-sm border p-4">
              <p className="text-danger text-sm">{error}</p>
            </div>
          ) : !detail ? (
            <EmptyState
              icon={<IconStethoscope className="size-6" />}
              title="No trace selected"
              description="Select a trace event from the timeline."
              bare
            />
          ) : (
            <>
              <TraceDetailSummary detail={detail} onCopy={handleCopy} />
              <TraceDetailSections detail={detail} events={events} />
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
