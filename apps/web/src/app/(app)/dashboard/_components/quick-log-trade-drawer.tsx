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
import { IconPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { EntryForm } from '@/app/(app)/journal/_components/entry-form';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';

export function QuickLogTradeDrawer({ onTradeLogged }: { onTradeLogged?: () => void }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleSuccess() {
    setOpen(false);
    onTradeLogged?.();
    router.refresh();
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="primary" size="sm" className="gap-1.5 font-semibold shadow-xs">
          <IconPlus className="size-4" />
          <span>Log Trade</span>
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[90vh] overflow-y-auto">
        <DrawerHeader>
          <DrawerTitle>Log New Trade</DrawerTitle>
          <DrawerDescription>
            Record an active or pending order to track live risk, floating R, and execution
            psychology.
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <EntryForm onCreated={handleSuccess} />
        </div>
        <div className="border-border border-t p-3">
          <DrawerClose className="text-fg-muted hover:text-fg text-body-sm w-full py-1 text-center">
            Cancel
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
