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

// SPDX-License-Identifier: Apache-2.0

import { IconArrowRight, IconCpu } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { PixelDeskStandby } from '@/components/chat/parts/pixel-desk/pixel-desk';
import { Card } from '@/components/ui/card';

export function QuantDeskWidget() {
  const router = useRouter();

  const handleLaunchSpecialist = (prompt: string) => {
    // Navigate to chat with prompt
    router.push(`/chat?prompt=${encodeURIComponent(prompt)}`);
  };

  return (
    <Card as="section" aria-label="Kestrel Quant Floor" className="flex flex-col gap-2.5 sm:gap-3 p-2.5 sm:p-4">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 sm:pb-2.5">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <IconCpu className="text-brand size-4 sm:size-4.5" />
          <h3 className="text-fg text-body-sm font-semibold">Kestrel Quant Floor</h3>
          <span className="bg-bull/10 text-bull border-bull/30 rounded-xs border px-1.5 py-0.5 font-mono text-[9px] sm:text-[10px] font-semibold uppercase">
            LIVE DESK
          </span>
        </div>
        <Link
          href="/chat"
          className="text-fg-subtle hover:text-brand inline-flex items-center gap-1 font-mono text-[11px] sm:text-xs font-semibold transition-colors touch-manipulation"
        >
          <span className="hidden sm:inline">Open Chat Desk</span>
          <span className="sm:hidden">Open</span>
          <IconArrowRight className="size-3.5" />
        </Link>
      </header>

      <div className="flex justify-center">
        <PixelDeskStandby onSelectPrompt={handleLaunchSpecialist} />
      </div>
    </Card>
  );

}
