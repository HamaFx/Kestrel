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

import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface SpriteProps {
  className?: string;
  isThinking?: boolean;
  isDone?: boolean;
  bias?: 'bullish' | 'bearish' | 'neutral';
  isSparkling?: boolean;
  hasAlarm?: boolean;
  hasWingsSpread?: boolean;
  isShielding?: boolean;
  style?: CSSProperties;
}

function InstrumentGlyph({
  children,
  className,
  viewBox = '0 0 24 24',
  style,
}: {
  children: ReactNode;
  className?: string;
  viewBox?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={style}
      className={cn(
        'bg-bg-elev-2 border-border/80 inline-flex size-8 shrink-0 items-center justify-center rounded-md border select-none',
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox={viewBox} className="size-4" fill="none">
        {children}
      </svg>
    </span>
  );
}

/**
 * Technical Structure Glyph — Minimalist candlestick & structure level vector
 */
export function ChartWizardSprite({ className, isThinking, bias, style }: SpriteProps) {
  const stroke = bias === 'bearish' ? '#e02c10' : bias === 'bullish' ? '#3f9e3d' : '#f0f0f0';

  return (
    <InstrumentGlyph style={style} className={cn(isThinking && 'border-fg/30', className)}>
      <line x1="6" y1="6" x2="6" y2="18" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
      <rect x="4.5" y="9" width="3" height="6" rx="0.75" fill={stroke} />
      <line
        x1="12"
        y1="8"
        x2="12"
        y2="19"
        stroke="#8e8e8e"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="10.5" y="11" width="3" height="5" rx="0.75" fill="#8e8e8e" />
      <line
        x1="18"
        y1="4"
        x2="18"
        y2="16"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="16.5" y="6" width="3" height="6.5" rx="0.75" fill={stroke} />
    </InstrumentGlyph>
  );
}

/**
 * Macro & Rates Glyph — Yield curve & central bank differential vector
 */
export function MacroMageSprite({ className, isThinking, bias, style }: SpriteProps) {
  const stroke = bias === 'bearish' ? '#e02c10' : bias === 'bullish' ? '#3f9e3d' : '#4fa3b5';

  return (
    <InstrumentGlyph style={style} className={cn(isThinking && 'border-fg/30', className)}>
      <path
        d="M4 17C7 16.5 9.5 14 12 11.5C14.5 9 17 7.5 20 7"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <line
        x1="4"
        y1="19"
        x2="20"
        y2="19"
        stroke="#727272"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <circle cx="18.5" cy="7.2" r="2" fill={stroke} />
    </InstrumentGlyph>
  );
}

/**
 * Risk & Sizing Glyph — Calibrated drawdown & invalidation shield vector
 */
export function RiskKnightSprite({ className, isThinking, bias, hasAlarm, style }: SpriteProps) {
  const stroke =
    hasAlarm || bias === 'bearish' ? '#e02c10' : bias === 'bullish' ? '#3f9e3d' : '#d98f00';

  return (
    <InstrumentGlyph style={style} className={cn(isThinking && 'border-fg/30', className)}>
      <path
        d="M12 3.5L19 6.5V11.5C19 16 15.9 19.6 12 20.8C8.1 19.6 5 16 5 11.5V6.5L12 3.5Z"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <line
        x1="9"
        y1="12"
        x2="15"
        y2="12"
        stroke="#f0f0f0"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </InstrumentGlyph>
  );
}

/**
 * Sentiment & Positioning Glyph — COT institutional flow radar vector
 */
export function KestrelFalconSprite({ className, isThinking, bias, style }: SpriteProps) {
  const stroke = bias === 'bearish' ? '#e02c10' : bias === 'bullish' ? '#3f9e3d' : '#ff3616';

  return (
    <InstrumentGlyph style={style} className={cn(isThinking && 'border-fg/30', className)}>
      <circle cx="12" cy="12" r="7.5" stroke="#727272" strokeWidth="1.25" />
      <circle cx="12" cy="12" r="3.5" stroke={stroke} strokeWidth="1.5" />
      <line
        x1="12"
        y1="12"
        x2="17.2"
        y2="6.8"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </InstrumentGlyph>
  );
}

export function TechnicalWorkstation({ isThinking }: { isThinking?: boolean }) {
  return (
    <span
      className={cn(
        'block h-0.5 w-6 rounded-full transition-colors',
        isThinking ? 'bg-brand' : 'bg-border',
      )}
    />
  );
}

export function MacroWorkstation({ isThinking }: { isThinking?: boolean }) {
  return <TechnicalWorkstation isThinking={isThinking} />;
}

export function RiskWorkstation({ isThinking }: { isThinking?: boolean }) {
  return <TechnicalWorkstation isThinking={isThinking} />;
}

export function SentinelWorkstation({ isThinking }: { isThinking?: boolean }) {
  return <TechnicalWorkstation isThinking={isThinking} />;
}

export function TradingFloorDesk({
  consensusBias,
}: {
  consensusBias?: 'bullish' | 'bearish' | 'neutral' | 'disputed';
  isThinking?: boolean;
}) {
  return (
    <div
      className={cn(
        'h-px w-full transition-colors',
        consensusBias === 'bullish'
          ? 'bg-bull/40'
          : consensusBias === 'bearish'
            ? 'bg-bear/40'
            : consensusBias === 'disputed'
              ? 'bg-warn/40'
              : 'bg-border/70',
      )}
    />
  );
}

export function RetroCrtMonitor({ isThinking }: { isThinking?: boolean }) {
  return <TechnicalWorkstation isThinking={isThinking} />;
}
