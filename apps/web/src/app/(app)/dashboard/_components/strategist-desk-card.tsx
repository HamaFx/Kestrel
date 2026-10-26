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
import Image from 'next/image';
import Link from 'next/link';

import type { StrategistDeskConfig } from '@/lib/kestrel-strategist-desks';

export function StrategistDeskCard({ desk }: { desk: StrategistDeskConfig }) {
  const consultHref = `/chat?desk=${desk.id}&prompt=${encodeURIComponent(desk.defaultPrompt)}`;

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-white/[0.08] bg-bg-elev-1/90 p-4 transition-all duration-200 hover:border-brand/40 hover:bg-bg-elev-2 backdrop-blur-md shadow-sm">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-4 -right-4 z-0 size-28 opacity-10 transition-opacity duration-300 mix-blend-luminosity group-hover:opacity-20"
      >
        <Image src={desk.artworkPath} alt="" fill unoptimized className="object-contain object-top-right" />
      </div>

      <div className="relative z-10 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-semibold tracking-wider text-brand uppercase">
            {desk.code}
          </span>
          <span className="size-1.5 rounded-full" style={{ backgroundColor: desk.accentColor }} />
        </div>

        <div>
          <h3 className="font-display text-base font-normal text-fg">{desk.title}</h3>
          <p className="font-serif text-xs italic text-fg-subtle">&ldquo;{desk.epithet}&rdquo;</p>
        </div>

        <p className="line-clamp-2 text-xs leading-relaxed text-fg-muted">{desk.description}</p>
      </div>

      <div className="relative z-10 mt-3 border-t border-border/40 pt-3">
        <Link
          href={consultHref}
          className="inline-flex w-full items-center justify-between rounded-lg border border-white/[0.08] bg-bg-elev-2 px-3 py-2 font-mono text-xs font-medium text-fg transition-all hover:border-brand/40 hover:text-brand active:translate-y-[0.5px]"
        >
          <span>Consult Desk</span>
          <IconArrowRight className="size-3 text-brand transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
