#!/usr/bin/env node
// @ts-check
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

// Wide (landscape) install-dialog screenshots — 1920x1080. Chrome rejects the
// richer install UI on desktop unless the manifest ships at least one
// screenshot with `form_factor: 'wide'`; it also renders them in the
// Play Store-style listing. Layout mirrors the desktop shell: sidebar rail,
// chat column, docked market column.
import { canvas, COLORS, heading, line, logoImage, path, rect, text } from './kit.mjs';

const WIDTH = 1920;
const HEIGHT = 1080;

const RAIL_X = 0;
const RAIL_W = 96;
const MAIN_X = 128;
const MAIN_W = 1000;
const DOCK_X = 1176;
const DOCK_W = 680;

/** Shared window chrome: sidebar rail + top bar + status footer. */
function shell(body) {
  return canvas(
    WIDTH,
    HEIGHT,
    `${rect(RAIL_X, 0, RAIL_W, HEIGHT, COLORS.bgElev1, 0)}
  ${line(RAIL_W, 0, RAIL_W, HEIGHT, COLORS.border, 2)}
  ${rect(0, 96, WIDTH, 2, COLORS.border, 0)}
  ${logoImage(28, 30, 40, 27)}
  ${heading(128, 46, 'Kestrel', 24, COLORS.fg, 700)}
  ${text(128, 72, 'AI MARKET INTELLIGENCE', 11, COLORS.subtle, 600)}
  ${rect(360, 30, 132, 36, COLORS.bgElev2, 2, COLORS.border)}
  ${text(426, 54, 'RESEARCH', 13, COLORS.brand, 700, 'middle')}
  ${rect(504, 30, 132, 36, COLORS.bgElev2, 2, COLORS.border)}
  ${text(570, 54, 'OVERVIEW', 13, COLORS.muted, 600, 'middle')}
  ${rect(648, 30, 120, 36, COLORS.bgElev2, 2, COLORS.border)}
  ${text(708, 54, 'JOURNAL', 13, COLORS.muted, 600, 'middle')}
  ${rect(780, 30, 118, 36, COLORS.bgElev2, 2, COLORS.border)}
  ${text(839, 54, 'MARKET', 13, COLORS.muted, 600, 'middle')}
  ${text(1856, 54, 'DEMO', 13, COLORS.brand, 700, 'end')}
  ${body}
  ${line(0, 1004, WIDTH, 1004, COLORS.border, 2)}
  ${text(128, 1044, 'Kestrel', 14, COLORS.subtle, 600)}
  ${text(1856, 1044, 'DEMO PREVIEW', 13, COLORS.subtle, 600, 'end')}`,
  );
}

/** Chat workspace: user turn + assistant analysis with metric chips. */
function chatColumn() {
  const body = [];
  body.push(text(MAIN_X, 168, 'AI CHAT', 13, COLORS.brand, 700));
  body.push(heading(MAIN_X, 212, 'Your market copilot', 34, COLORS.fg, 700));
  body.push(
    text(
      MAIN_X,
      248,
      'Price action, structure, risk and journal — in plain language.',
      15,
      COLORS.muted,
      500,
    ),
  );

  body.push(rect(MAIN_X, 292, 820, 118, COLORS.bgElev2, 2, COLORS.border));
  body.push(text(MAIN_X + 28, 328, 'YOU', 11, COLORS.brand, 700));
  body.push(text(MAIN_X + 28, 364, 'What is the current gold setup?', 20, COLORS.fg, 600));
  body.push(
    text(MAIN_X + 28, 392, 'Bias, key levels and the risk context.', 15, COLORS.muted, 500),
  );

  body.push(rect(MAIN_X + 84, 442, MAIN_W - 84, 300, COLORS.bgElev3, 2, COLORS.border));
  body.push(text(MAIN_X + 116, 480, 'KESTREL AI', 11, COLORS.info, 700));
  body.push(text(MAIN_X + 116, 520, 'XAUUSD  ·  TECHNICAL READ', 18, COLORS.fg, 700));
  body.push(
    text(
      MAIN_X + 116,
      556,
      'Constructive while price holds above the demand band.',
      15,
      COLORS.muted,
      500,
    ),
  );
  const chips = [
    ['BIAS', 'BULLISH', COLORS.bull],
    ['RSI14', '58.4', COLORS.fg],
    ['STRUCTURE', 'BOS UP', COLORS.bull],
  ];
  chips.forEach((chip, i) => {
    const x = MAIN_X + 116 + i * 240;
    body.push(rect(x, 578, 216, 68, COLORS.bgElev2, 2, COLORS.border));
    body.push(text(x + 20, 604, chip[0], 10, COLORS.subtle, 700));
    body.push(text(x + 20, 632, chip[1], 17, chip[2], 700));
  });
  body.push(text(MAIN_X + 116, 692, 'Support  2,318.40', 15, COLORS.fg, 600));
  body.push(text(MAIN_X + 420, 692, 'Resistance  2,356.80', 15, COLORS.fg, 600));

  body.push(text(MAIN_X, 800, 'QUICK PROMPTS', 12, COLORS.subtle, 700));
  ['Explain the trend', 'Find key levels', 'Review my risk'].forEach((label, i) => {
    const x = MAIN_X + i * 272;
    body.push(rect(x, 826, 248, 56, COLORS.bgElev2, 2, COLORS.border));
    body.push(text(x + 20, 860, label, 15, COLORS.fg, 600));
    body.push(text(x + 224, 860, '→', 18, COLORS.brand, 700, 'end'));
  });

  body.push(rect(MAIN_X, 918, MAIN_W, 66, COLORS.bgElev2, 2, COLORS.border));
  body.push(
    text(MAIN_X + 24, 958, 'Ask Kestrel anything about your markets…', 16, COLORS.muted, 500),
  );
  body.push(rect(MAIN_X + MAIN_W - 76, 930, 56, 42, COLORS.brand, 2));
  body.push(text(MAIN_X + MAIN_W - 48, 957, '↑', 20, COLORS.onBrand, 700, 'middle'));
  return body;
}

/** Docked market column: pulse panel, watchlist, session status. */
function marketDock() {
  const body = [];
  body.push(rect(DOCK_X, 128, DOCK_W, 244, COLORS.bgElev2, 2, COLORS.border));
  body.push(text(DOCK_X + 28, 168, 'MARKET PULSE', 11, COLORS.subtle, 700));
  body.push(text(DOCK_X + 28, 206, 'XAUUSD', 20, COLORS.fg, 700));
  body.push(text(DOCK_X + 28, 258, '2,341.28', 36, COLORS.fg, 700));
  body.push(text(DOCK_X + 250, 256, '+0.84%', 17, COLORS.bull, 700));
  body.push(text(DOCK_X + DOCK_W - 28, 168, 'OPEN', 12, COLORS.bull, 700, 'end'));
  body.push(
    path(
      `M ${DOCK_X + 28} 330 C ${DOCK_X + 96} 302, ${DOCK_X + 148} 318, ${DOCK_X + 216} 288 S ${DOCK_X + 344} 300, ${DOCK_X + 412} 262 S ${DOCK_X + 552} 278, ${DOCK_X + DOCK_W - 28} 244`,
      COLORS.bull,
      4,
    ),
  );
  body.push(line(DOCK_X + 28, 344, DOCK_X + DOCK_W - 28, 344, COLORS.border, 1));

  body.push(text(DOCK_X, 420, 'WATCHLIST', 12, COLORS.subtle, 700));
  const rows = [
    ['XAUUSD', '2,341.28', '+0.84%', COLORS.bull],
    ['EURUSD', '1.0842', '+0.31%', COLORS.bull],
    ['GBPUSD', '1.2718', '-0.18%', COLORS.bear],
  ];
  rows.forEach((row, i) => {
    const y = 448 + i * 70;
    body.push(
      rect(DOCK_X, y, DOCK_W, 56, i === 0 ? COLORS.bgElev3 : COLORS.bgElev2, 2, COLORS.border),
    );
    body.push(text(DOCK_X + 24, y + 36, row[0], 16, COLORS.fg, 700));
    body.push(text(DOCK_X + 250, y + 36, row[1], 15, COLORS.fg, 600));
    body.push(text(DOCK_X + DOCK_W - 24, y + 36, row[2], 15, row[3], 700, 'end'));
  });

  body.push(text(DOCK_X, 700, 'AI BRIEFING', 12, COLORS.subtle, 700));
  body.push(rect(DOCK_X, 728, DOCK_W, 168, COLORS.bgElev3, 2, COLORS.border));
  body.push(rect(DOCK_X + 24, 752, 34, 34, COLORS.brand, 2));
  body.push(text(DOCK_X + 41, 775, '✦', 17, COLORS.onBrand, 700, 'middle'));
  body.push(text(DOCK_X + 74, 775, "TODAY'S FOCUS", 11, COLORS.brand, 700));
  body.push(text(DOCK_X + 24, 830, 'Gold holds a constructive bias.', 18, COLORS.fg, 650));
  body.push(text(DOCK_X + 24, 862, 'Watch 2,318 for invalidation.', 15, COLORS.muted, 500));

  body.push(text(DOCK_X, 956, 'SESSION STATUS', 12, COLORS.subtle, 700));
  body.push(text(DOCK_X + 118, 956, 'LIQUIDITY HIGH', 12, COLORS.bull, 700));
  body.push(text(DOCK_X + 300, 956, 'RISK BALANCED', 12, COLORS.info, 700));
  body.push(text(DOCK_X + 466, 956, 'NEXT 14:00 UTC', 12, COLORS.warn, 700));
  return body;
}

export function chatWideSvg() {
  return shell([...chatColumn(), ...marketDock()].join('\n'));
}

/** Desktop dashboard: market pulse header, watchlist table, AI briefing. */
export function dashboardWideSvg() {
  const body = [];
  body.push(text(MAIN_X, 168, 'OVERVIEW', 13, COLORS.brand, 700));
  body.push(heading(MAIN_X, 212, 'Good morning, trader.', 34, COLORS.fg, 700));
  body.push(text(MAIN_X, 248, 'A focused view of what matters now.', 15, COLORS.muted, 500));

  const stats = [
    ['EQUITY', '128,430', '+2.4% today', COLORS.bull],
    ['OPEN RISK', '0.8 R', 'within plan', COLORS.info],
    ['WIN RATE', '58%', 'last 40 trades', COLORS.fg],
  ];
  stats.forEach((stat, i) => {
    const x = MAIN_X + i * 340;
    body.push(rect(x, 292, 312, 132, COLORS.bgElev2, 2, COLORS.border));
    body.push(text(x + 24, 328, stat[0], 11, COLORS.subtle, 700));
    body.push(text(x + 24, 376, stat[1], 30, COLORS.fg, 700));
    body.push(text(x + 24, 404, stat[2], 14, stat[3], 600));
  });

  body.push(text(MAIN_X, 480, 'WATCHLIST', 12, COLORS.subtle, 700));
  const rows = [
    ['XAUUSD', '2,341.28', '+0.84%', 'HIGH', COLORS.bull],
    ['EURUSD', '1.0842', '+0.31%', 'MID', COLORS.bull],
    ['GBPUSD', '1.2718', '-0.18%', 'LOW', COLORS.bear],
  ];
  rows.forEach((row, i) => {
    const y = 508 + i * 74;
    body.push(rect(MAIN_X, y, MAIN_W, 60, COLORS.bgElev2, 2, COLORS.border));
    body.push(text(MAIN_X + 24, y + 38, row[0], 17, COLORS.fg, 700));
    body.push(text(MAIN_X + 240, y + 38, row[1], 16, COLORS.fg, 600));
    body.push(text(MAIN_X + 430, y + 38, row[2], 16, row[4], 700));
    body.push(text(MAIN_X + MAIN_W - 24, y + 38, row[3], 13, COLORS.subtle, 600, 'end'));
  });

  body.push(rect(MAIN_X, 754, MAIN_W, 230, COLORS.bgElev3, 2, COLORS.border));
  body.push(rect(MAIN_X + 24, 782, 36, 36, COLORS.brand, 2));
  body.push(text(MAIN_X + 42, 807, '✦', 18, COLORS.onBrand, 700, 'middle'));
  body.push(text(MAIN_X + 78, 807, "TODAY'S FOCUS", 12, COLORS.brand, 700));
  body.push(
    text(MAIN_X + 24, 872, 'Gold is holding a constructive intraday bias.', 22, COLORS.fg, 650),
  );
  body.push(
    text(
      MAIN_X + 24,
      910,
      'Watch the 2,318 area for invalidation; avoid chasing into resistance.',
      15,
      COLORS.muted,
      500,
    ),
  );
  body.push(rect(MAIN_X + 24, 936, 196, 38, COLORS.bgElev2, 2, COLORS.border));
  body.push(text(MAIN_X + 46, 961, 'Ask follow-up  →', 14, COLORS.fg, 600));

  return shell([...body, ...marketDock()].join('\n'));
}

export const WIDE_SHOTS = Object.freeze([
  { file: 'chat-wide.png', width: WIDTH, height: HEIGHT, formFactor: 'wide', svg: chatWideSvg() },
  {
    file: 'dashboard-wide.png',
    width: WIDTH,
    height: HEIGHT,
    formFactor: 'wide',
    svg: dashboardWideSvg(),
  },
]);
