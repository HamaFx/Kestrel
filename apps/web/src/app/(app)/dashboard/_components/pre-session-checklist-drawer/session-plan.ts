// SPDX-License-Identifier: Apache-2.0

// Preset execution focus rules offered in the pre-session ritual.
//
// The stored shape is `SessionGameplan` from `@kestrel/shared`; it lives on
// `user_settings.session_gameplan` (see `@/lib/services/session-gameplan`).
export const PRESET_RULES = [
  'Wait for 15M candle close confirmation before entering',
  'Strict 1:2 minimum Risk-to-Reward on every execution',
  'Zero trading during high-impact news releases',
  'Max 2 trades per session — quality over quantity',
  'Take profits at key liquidity levels; do not be greedy',
];
