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
import { IconArrowRight, IconSwitchHorizontal } from '@tabler/icons-react';
import Link from 'next/link';
import { useState } from 'react';

import { BlueprintPlate } from '@/components/brand/blueprint-plates';
import type { StrategistDeskConfig } from '@/lib/kestrel-strategist-desks';

export function StrategistDeskCard({ desk }: { desk: StrategistDeskConfig }) {
  const [usePairedArt, setUsePairedArt] = useState(false);
  const consultHref = `/chat?desk=${desk.id}&prompt=${encodeURIComponent(desk.defaultPrompt)}`;
  const activePlateId =
    usePairedArt && desk.pairedBlueprintId ? desk.pairedBlueprintId : desk.blueprintId;

  return (
    <div className="group hover:bg-bg-elev-2 relative flex flex-col justify-between overflow-hidden bg-[#121315] p-3.5 transition-colors duration-200 sm:p-4">
      <div className="flex flex-col gap-3">
        {/* Top Chiaroscuro + CAD + ASCII Plate Header */}
        <div className="relative">
          <BlueprintPlate
            id={activePlateId}
            variant="compact"
            showRasterBackup
            showAsciiStrip
            className="h-32 w-full"
          />
          {desk.pairedBlueprintId && (
            <button
              type="button"
              onClick={() => setUsePairedArt((prev) => !prev)}
              title="Switch between original and paired chiaroscuro plate"
              className="text-fg-subtle hover:text-fg absolute top-2 right-2 z-20 inline-flex items-center gap-1 rounded border border-white/15 bg-black/70 px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-wider uppercase backdrop-blur-sm transition-colors"
            >
              <IconSwitchHorizontal className="size-2.5" />
              {usePairedArt ? 'Plate II' : 'Plate I'}
            </button>
          )}
        </div>

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
