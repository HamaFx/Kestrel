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
import { IconArrowRight } from '@tabler/icons-react';
import Link from 'next/link';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import type { StrategistDeskConfig } from '@/lib/kestrel-strategist-desks';

export function StrategistDeskCard({ desk }: { desk: StrategistDeskConfig }) {
  const consultHref = `/chat?desk=${desk.id}&prompt=${encodeURIComponent(desk.defaultPrompt)}`;

  return (
    <div className="group hover:bg-bg-elev-2 relative flex flex-col justify-between overflow-hidden bg-[#121315] p-4 transition-colors duration-200">
      <BlueprintPlate
        id={desk.blueprintId}
        showRasterBackup
        variant="watermark"
        className="pointer-events-none absolute -top-2 -right-2 z-0 size-28 opacity-20 transition-opacity duration-300 group-hover:opacity-35"
      />

      <div className="relative z-10 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-brand font-mono text-[10px] font-semibold tracking-wider uppercase">
            {desk.code}
          </span>
          <span className="size-1.5 rounded-full" style={{ backgroundColor: desk.accentColor }} />
        </div>

        <div>
          <h3 className="font-display text-fg text-base font-normal">{desk.title}</h3>
          <p className="font-redaction-35 text-fg-subtle text-xs italic">
            &ldquo;{desk.epithet}&rdquo;
          </p>
        </div>

        <p className="text-fg-muted line-clamp-2 text-xs leading-relaxed">{desk.description}</p>
      </div>

      <div className="border-border/40 relative z-10 mt-3 border-t pt-3">
        <Link
          href={consultHref}
          className="bg-bg-elev-2 text-fg hover:border-brand/40 hover:text-brand inline-flex w-full items-center justify-between rounded-lg border border-white/[0.08] px-3 py-2 font-mono text-xs font-medium transition-all active:translate-y-[0.5px]"
        >
          <span>Consult Desk</span>
          <IconArrowRight className="text-brand size-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
