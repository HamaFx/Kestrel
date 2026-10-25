// SPDX-License-Identifier: Apache-2.0

// Session gameplan shape, per-day localStorage key, and the preset execution
// focus rules offered in the pre-session ritual.
export interface SessionPlan {
  date: string;
  maxDailyR: number;
  mindset: string;
  primaryRule: string;
  newsReviewed: boolean;
  strategyAligned: boolean;
  completedAt: number;
}

export const STORAGE_KEY_PREFIX = 'kestrel:session-gameplan:';

export function getTodayKey(): string {
  const d = new Date();
  return `${STORAGE_KEY_PREFIX}${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const PRESET_RULES = [
  'Wait for 15M candle close confirmation before entering',
  'Strict 1:2 minimum Risk-to-Reward on every execution',
  'Zero trading during high-impact news releases',
  'Max 2 trades per session — quality over quantity',
  'Take profits at key liquidity levels; do not be greedy',
];
