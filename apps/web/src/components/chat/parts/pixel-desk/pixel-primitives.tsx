'use client';

// SPDX-License-Identifier: Apache-2.0

// Shared pixel-desk primitives: desk glyph dispatch and quick symbols for the
// standby launcher. (The live thinking card now renders the Hoplite Plasma
// Circuit Spine — see `../syndicate-dossier/syndicate-circuit-live`.)
import {
  ChartWizardSprite,
  KestrelFalconSprite,
  MacroMageSprite,
  RiskKnightSprite,
} from './pixel-sprites';

import './pixel-desk-animations.css';

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
