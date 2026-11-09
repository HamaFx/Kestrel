// SPDX-License-Identifier: Apache-2.0

// Kinetic hero showcase data: highlights Kestrel's core trader superpowers
// (AI Chart Vision, 1% Risk Shield, 24/7 Phone Radar) without symbol lists.

export interface HeroHighlightPill {
  badge: string;
  title: string;
  detail: string;
  tone: 'brand' | 'bull' | 'info';
}

export const HERO_HIGHLIGHTS: readonly HeroHighlightPill[] = [
  {
    badge: 'AI CHART VISION',
    title: 'Drop Any Screenshot',
    detail: 'Reads structure & key levels in 5s',
    tone: 'brand',
  },
  {
    badge: '1% RISK SHIELD',
    title: 'Auto-Sized Protection',
    detail: 'Exact stop-loss & lot size locked',
    tone: 'bull',
  },
  {
    badge: '24/7 RADAR',
    title: 'Instant Phone Alerts',
    detail: 'Telegram & Push when levels hit',
    tone: 'info',
  },
] as const;

export const TICKER_ITEMS = [
  { label: 'AI CHART SCREENSHOT VISION', tag: 'INSTANT READ', up: true },
  { label: '1.0% ACCOUNT RISK SHIELD', tag: 'AUTO STOP-LOSS', up: true },
  { label: '24/7 TELEGRAM & PHONE ALERTS', tag: 'REAL-TIME PING', up: true },
  { label: 'VOICE & SLASH COMMAND COPILOT', tag: 'HANDS-FREE', up: true },
  { label: 'BUILT-IN PAPER TRADING DESK', tag: 'ZERO-RISK PRACTICE', up: true },
  { label: 'STRATEGY BACKTESTING LAB', tag: 'HISTORICAL REPLAY', up: true },
  { label: 'R-MULTIPLE TRADE JOURNAL', tag: 'EQUITY ANALYTICS', up: true },
] as const;
