'use client';

// SPDX-License-Identifier: Apache-2.0

// Shared pixel-desk primitives: desk glyph dispatch, quick symbols, and the
// rotating status lines used while the committee deliberates.
import {
  ChartWizardSprite,
  KestrelFalconSprite,
  MacroMageSprite,
  RiskKnightSprite,
} from './pixel-sprites';

import './pixel-desk-animations.css';

export const QUANT_STATUS_STEPS = [
  'Reading 15m, 1h & 4h market structure…',
  'Evaluating macro catalysts, real yields & DXY…',
  'Auditing 1% risk sizing & ATR invalidation levels…',
  'Scanning CFTC COT positioning & order flow…',
  'Synthesizing 4-desk committee consensus…',
];

export const QUICK_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'USDJPY'] as const;

export function renderDeskGlyph(
  deskId: string,
  opts?: { isThinking?: boolean; isDone?: boolean; bias?: 'bullish' | 'bearish' | 'neutral' },
) {
  switch (deskId) {
    case 'technical':
      return <ChartWizardSprite {...opts} />;
    case 'fundamental':
      return <MacroMageSprite {...opts} />;
    case 'risk':
      return <RiskKnightSprite {...opts} />;
    default:
      return <KestrelFalconSprite {...opts} />;
  }
}
