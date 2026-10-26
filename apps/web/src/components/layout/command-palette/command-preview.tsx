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
import { IconArrowRight, IconChartLine, IconInfoCircle, IconTerminal2 } from '@tabler/icons-react';

import type { CommandItem } from '@/lib/commands';

interface CommandPreviewProps {
  command?: CommandItem | undefined;
}

export function CommandPreview({ command }: CommandPreviewProps) {
  if (!command) {
    return (
      <div className="text-fg-subtle flex h-full flex-col items-center justify-center p-6 text-center font-mono text-xs">
        <IconTerminal2 className="text-fg-subtle/50 mb-2 size-8 stroke-[1.25]" />
        <span>Select a command to preview</span>
      </div>
    );
  }

  const Icon = command.icon;
  const isChart = command.href?.startsWith('/chart');
  const isChat = command.href === '/chat' || command.id === 'create-chat';

  return (
    <div className="flex h-full flex-col justify-between p-5 font-mono">
      <div className="flex flex-col gap-4">
        {/* Header Icon + Title */}
        <div className="flex items-start gap-3">
          <div className="bg-bg-elev-2 text-brand flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] shadow-sm">
            <Icon className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-brand text-[10px] font-semibold tracking-wider uppercase">
              {command.group}
            </div>
            <div className="text-fg truncate font-sans text-base font-semibold">
              {command.label}
            </div>
          </div>
        </div>

        {/* Detailed Context */}
        <div className="bg-bg-elev-2/60 text-fg-muted flex flex-col gap-2 rounded-xl border border-white/[0.06] p-3.5 text-xs">
          {isChart && (
            <div className="flex flex-col gap-2">
              <div className="text-fg flex items-center gap-1.5 text-xs font-semibold">
                <IconChartLine className="text-bull size-4" />
                <span>Market Microstructure</span>
              </div>
              <p className="text-fg-subtle font-sans text-[11px] leading-relaxed">
                Open real-time TradingView charting workstation with multi-timeframe candles,
                indicators, and volume analysis.
              </p>
            </div>
          )}

          {isChat && (
            <div className="flex flex-col gap-2">
              <div className="text-fg flex items-center gap-1.5 text-xs font-semibold">
                <IconTerminal2 className="text-brand size-4" />
                <span>Autonomous AI Council</span>
              </div>
              <p className="text-fg-subtle font-sans text-[11px] leading-relaxed">
                Convene the 4-desk institutional trading committee: Technical, Fundamental, Risk
                Governance, and Market Structure.
              </p>
            </div>
          )}

          {!isChart && !isChat && (
            <div className="flex flex-col gap-1.5">
              <div className="text-fg-subtle flex items-center gap-1.5 text-[11px]">
                <IconInfoCircle className="size-3.5" />
                <span>Destination / Target</span>
              </div>
              <div className="text-fg font-sans text-xs break-all">
                {command.href ?? 'System Action Trigger'}
              </div>
            </div>
          )}

          {command.keywords && command.keywords.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1 border-t border-white/[0.05] pt-1">
              {command.keywords.slice(0, 4).map((kw) => (
                <span
                  key={kw}
                  className="bg-bg-elev-3/60 text-fg-subtle rounded px-1.5 py-0.5 text-[9px]"
                >
                  #{kw}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action Prompt */}
      <div className="text-fg-subtle mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[11px]">
        <span className="flex items-center gap-1">
          <IconArrowRight className="text-brand size-3.5" />
          <span>Execute command</span>
        </span>
        <kbd className="bg-bg-elev-3 text-fg inline-flex items-center gap-1 rounded border border-white/[0.08] px-2 py-0.5 text-[10px] shadow-sm">
          <span>↵</span>
          <span>ENTER</span>
        </kbd>
      </div>
    </div>
  );
}
