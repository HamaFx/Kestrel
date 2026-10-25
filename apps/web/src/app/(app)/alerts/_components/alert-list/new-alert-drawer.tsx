'use client';

// SPDX-License-Identifier: Apache-2.0

// Drawer wrapper that hosts the new-alert form.
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

import { AlertForm } from '../alert-form';

interface NewAlertDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function NewAlertDrawer({ open, onOpenChange, onCreated }: NewAlertDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>New alert</DrawerTitle>
          <DrawerDescription>Set a price, indicator, or candle-close trigger.</DrawerDescription>
        </DrawerHeader>
        <AlertForm onCreated={onCreated} />
      </DrawerContent>
    </Drawer>
  );
}
