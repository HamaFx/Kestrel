// SPDX-License-Identifier: Apache-2.0

// Simplified, high-hype data for `LandingArchitecture`: combines the 1-click
// Trap Blocker vs. Green-Light stage with the 4 Kestrel Superpower Bento cards.

export type ConduitMode = 'approved' | 'blocked';

export interface ConduitSummary {
  badge: string;
  headline: string;
  subline: string;
  pills: readonly { label: string; value: string }[];
}

export const CONDUIT_SUMMARIES: Record<ConduitMode, ConduitSummary> = {
  approved: {
    badge: 'GREEN LIGHT · SAFE TO TRADE',
    headline: 'Clean Setup Cleared Through the 1% Shield',
    subline:
      'Trend is aligned, no dangerous news is nearby, and your stop-loss risks only 0.85% of your account.',
    pills: [
      { label: 'ACCOUNT RISK', value: '0.85% (Inside 1% Cap)' },
      { label: 'PROFIT TARGETS', value: 'TP1 · TP2 · TP3 Locked' },
      { label: 'PHONE ALERTS', value: 'Telegram & Push Armed' },
    ],
  },
  blocked: {
    badge: 'TRAP BLOCKED · CAPITAL SAVED',
    headline: 'FOMO Fakeout & News Bomb Intercepted',
    subline:
      'The chart looked tempting, but CPI news drops in 12 minutes and the stop-loss would risk 2.4%. Kestrel blocks the trap.',
    pills: [
      { label: 'DANGER CAUGHT', value: 'CPI News in 12 Mins' },
      { label: 'OVER-RISK BLOCKED', value: '2.4% Risk Exceeds 1% Rule' },
      { label: 'MONEY SAVED', value: '$2,400 Whipsaw Avoided' },
    ],
  },
};

export interface SuperpowerCardSpec {
  id: 'vision' | 'radar' | 'backtest' | 'journal';
  tag: string;
  title: string;
  description: string;
  accent: 'brand' | 'bull' | 'info' | 'warn';
}

export const SUPERPOWER_CARDS: readonly SuperpowerCardSpec[] = [
  {
    id: 'vision',
    tag: 'AI CHART VISION',
    title: 'Drop Any Chart Screenshot',
    description:
      'Paste or drag any chart image into chat. Kestrel reads candlestick patterns, trendlines, and support/resistance zones in 5 seconds.',
    accent: 'brand',
  },
  {
    id: 'radar',
    tag: '24/7 PHONE RADAR',
    title: 'Instant Telegram & Push Alerts',
    description:
      'Stop staring at screens all night. Set price, RSI, EMA, or candle-close triggers and get pinged on your phone the second your level hits.',
    accent: 'info',
  },
  {
    id: 'backtest',
    tag: 'BACKTEST & PAPER DESK',
    title: 'Test & Practice Risk-Free',
    description:
      'Replay strategies on historical market data or practice live trades in the built-in Paper Trading desk before risking a single dollar.',
    accent: 'bull',
  },
  {
    id: 'journal',
    tag: 'AUTOMATED JOURNAL',
    title: 'Track Your Real R-Multiple Edge',
    description:
      'Log setups in one click and automatically track your win rate, equity curve, drawdown buffer, and best trading sessions.',
    accent: 'warn',
  },
] as const;
