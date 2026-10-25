'use client';

// SPDX-License-Identifier: Apache-2.0

// Uninstall confirmation drawer with the optional data-wipe switch.
import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import type { PluginStoreEntry } from '@/lib/plugins/types';

export function UninstallDrawer({
  entry,
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  entry: PluginStoreEntry | null;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (wipeData: boolean) => void;
}) {
  const [wipeData, setWipeData] = useState(false);

  useEffect(() => {
    if (!open) setWipeData(false);
  }, [open]);

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) setWipeData(false);
        onOpenChange(next);
      }}
    >
      <DrawerContent className="surface-panel border-border rounded-t-xl border-t">
        <DrawerHeader>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="text-danger bg-danger/10 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
            >
              <IconAlertTriangle className="size-5" />
            </span>
            <div className="min-w-0">
              <DrawerTitle>Uninstall {entry?.name}?</DrawerTitle>
              <DrawerDescription className="mt-1">
                Its tools, nav items and scheduled jobs stop immediately for your account.
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-2">
          <div className="border-border/60 bg-bg-elev-1/50 flex items-start justify-between gap-4 rounded-lg border p-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="wipe-plugin-data" className="text-fg text-sm font-semibold">
                Also delete saved plugin data
              </label>
              <p className="text-fg-subtle text-xs">
                Removes this plugin&apos;s stored documents and settings. This cannot be undone.
              </p>
            </div>
            <Switch
              id="wipe-plugin-data"
              checked={wipeData}
              onCheckedChange={setWipeData}
              srLabel="Also delete saved plugin data"
            />
          </div>
        </div>

        <DrawerFooter>
          <Button
            type="button"
            variant="danger"
            onClick={() => onConfirm(wipeData)}
            disabled={busy}
            className="w-full"
          >
            {busy ? 'Uninstalling…' : wipeData ? 'Uninstall & delete data' : 'Uninstall plugin'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="w-full"
          >
            Cancel
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
