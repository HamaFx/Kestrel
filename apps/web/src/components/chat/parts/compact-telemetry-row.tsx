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

import {
  IconAlertCircle,
  IconBuildingBank,
  IconChartCandle,
  IconChevronDown,
  IconCpu,
  IconPlayerPlay,
  IconRadar,
  IconScale,
  IconSearch,
} from '@tabler/icons-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface CompactTelemetryRowProps {
  name: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  input?: unknown;
  output?: unknown;
  errorMessage?: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}

const TOOL_VERBS: Record<string, string> = {
  'tool-get_price': 'Price',
  'tool-get_candles': 'Candles',
  'tool-get_indicators': 'Indicators',
  'tool-get_news': 'News',
  'tool-get_calendar': 'Calendar',
  'tool-convene_committee': 'Committee',
  'tool-compute_risk': 'Risk',
  'tool-get_market_structure': 'Structure',
  'tool-analyze_technical': 'Technicals',
  'tool-analyze_fundamental': 'Macro',
  'tool-get_social_sentiment': 'Sentiment',
  'tool-get_cot': 'COT Whale',
  'tool-web_search': 'Search',
  'tool-run_system_action': 'Exec',
  'tool-set_alert': 'Alert',
  'tool-log_journal': 'Journal',
};

function getToolIcon(name: string) {
  if (name.includes('price') || name.includes('candles') || name.includes('technical') || name.includes('indicator')) {
    return IconChartCandle;
  }
  if (name.includes('news') || name.includes('calendar') || name.includes('fundamental')) {
    return IconBuildingBank;
  }
  if (name.includes('risk')) {
    return IconScale;
  }
  if (name.includes('committee') || name.includes('cot') || name.includes('sentiment')) {
    return IconRadar;
  }
  if (name.includes('search')) {
    return IconSearch;
  }
  if (name.includes('action') || name.includes('exec')) {
    return IconPlayerPlay;
  }
  return IconCpu;
}

function formatTarget(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const obj = input as Record<string, unknown>;
  const parts: string[] = [];
  if (obj.symbol && typeof obj.symbol === 'string') parts.push(obj.symbol);
  if (obj.timeframe && typeof obj.timeframe === 'string') parts.push(obj.timeframe);
  if (obj.query && typeof obj.query === 'string') parts.push(`"${obj.query}"`);
  if (obj.command && typeof obj.command === 'string') parts.push(obj.command);
  if (obj.action && typeof obj.action === 'string') parts.push(obj.action);
  if (parts.length > 0) return parts.join(' · ');
  const keys = Object.keys(obj);
  if (keys.length > 0 && typeof obj[keys[0]!] === 'string') {
    return String(obj[keys[0]!]);
  }
  return '';
}

export function CompactTelemetryRow({
  name,
  state,
  input,
  output,
  errorMessage,
  defaultOpen = false,
  children,
}: CompactTelemetryRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [celebrate, setCelebrate] = useState(false);
  const prevStatusRef = useRef(state);

  const isRunning = state === 'input-streaming' || state === 'input-available';
  const isError = state === 'output-error';
  const isDone = state === 'output-available';

  useEffect(() => {
    const wasRunning =
      prevStatusRef.current === 'input-streaming' || prevStatusRef.current === 'input-available';
    prevStatusRef.current = state;
    if (wasRunning && state === 'output-available') {
      setCelebrate(true);
      const timer = window.setTimeout(() => setCelebrate(false), 950);
      return () => window.clearTimeout(timer);
    }
  }, [state]);

  const Icon = getToolIcon(name);
  const verb = TOOL_VERBS[name] ?? name.replace(/^tool-/, '').replace(/_/g, ' ');
  const target = formatTarget(name, input);

  return (
    <div className="w-full select-text py-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors',
          'hover:bg-white/[0.04] active:translate-y-[0.5px]',
          open && 'bg-white/[0.03]',
        )}
      >
        {/* Left Status Glyph */}
        <span className="relative grid size-4 shrink-0 place-items-center">
          {isRunning && (
            <>
              <span
                aria-hidden="true"
                className="border-brand/30 border-t-brand absolute inset-0 animate-spin rounded-full border-[1.5px]"
              />
              <Icon className="text-brand size-2.5" />
            </>
          )}
          {isError && <IconAlertCircle className="text-danger size-4 shrink-0" />}
          {isDone && (
            <>
              <Icon
                className={cn(
                  'size-3.5 transition-colors',
                  celebrate ? 'text-success' : 'text-fg-subtle group-hover:text-fg',
                )}
              />
              {celebrate && (
                <span className="text-success pointer-events-none absolute inset-0 grid place-items-center animate-in fade-in zoom-in-75 duration-200">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="size-3.5 stroke-current stroke-[2.5]"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              )}
            </>
          )}
        </span>

        {/* Tool Verb */}
        <span
          className={cn(
            'text-body font-medium shrink-0',
            isError ? 'text-danger' : isRunning ? 'text-brand' : 'text-fg',
          )}
        >
          {verb}
        </span>

        {/* Monospace Target Path or Arguments */}
        {target ? (
          <span className="font-mono text-caption text-fg-subtle min-w-0 flex-1 truncate">
            {target}
          </span>
        ) : (
          <span className="flex-1" />
        )}

        {/* Chevron Indicator */}
        <IconChevronDown
          className={cn(
            'text-fg-subtle size-3 shrink-0 transition-transform duration-150',
            open ? 'rotate-180 opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        />
      </button>

      {/* Recessed Drawer Content */}
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="surface-well mt-1 ml-6 rounded-lg p-2.5 text-xs">
              {children ? (
                children
              ) : isError ? (
                <p className="text-danger font-mono">{errorMessage ?? 'Tool execution failed'}</p>
              ) : (
                <pre className="font-mono text-caption text-fg-muted overflow-x-auto whitespace-pre-wrap">
                  {typeof output === 'string'
                    ? output
                    : JSON.stringify(output ?? input ?? {}, null, 2)}
                </pre>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
