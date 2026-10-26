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

// Portrait (narrow) install-dialog screenshots — 1080x1920, matching a
// modern phone. Referenced by `app/manifest.ts` with form_factor: 'narrow'.
import { canvas, COLORS, heading, line, logoImage, path, rect, text } from './kit.mjs';

const WIDTH = 1080;
const HEIGHT = 1920;

function shell(body) {
  return canvas(
    WIDTH,
    HEIGHT,
    `${rect(48, 54, 984, 76, COLORS.panel, 2, COLORS.border)}
  ${logoImage(72, 71, 44, 29)}
  ${heading(132, 91, 'Kestrel', 22, COLORS.fg, 700)}
  ${text(124, 112, 'AI TRADING COPILOT', 11, COLORS.subtle, 600)}
  ${text(972, 95, 'DEMO', 12, COLORS.brand, 700, 'end')}
  ${body}
  ${rect(48, 1810, 984, 2, COLORS.border, 0)}
  ${text(72, 1855, 'Kestrel', 14, COLORS.subtle, 600)}
  ${text(1008, 1855, 'DEMO PREVIEW', 12, COLORS.subtle, 600, 'end')}`,
  );
}

export function chatSvg() {
  const body = [];
  body.push(text(72, 200, 'AI CHAT', 13, COLORS.brand, 700));
  body.push(heading(72, 248, 'Your market copilot,', 38, COLORS.fg, 700));
  body.push(heading(72, 292, 'in plain language.', 38, COLORS.fg, 700));
  body.push(
    text(
      72,
      338,
      'Ask about price action, structure, risk, or your journal.',
      16,
      COLORS.muted,
      500,
    ),
  );

  body.push(rect(72, 400, 760, 146, COLORS.panel, 2, COLORS.border));
  body.push(text(104, 438, 'YOU', 11, COLORS.brand, 700));
  body.push(text(104, 478, 'What is the current gold setup?', 21, COLORS.fg, 600));
  body.push(
    text(104, 516, 'Give me the bias, key levels, and risk context.', 17, COLORS.muted, 500),
  );

  body.push(rect(178, 592, 830, 436, COLORS.elevated, 2, COLORS.border));
  body.push(text(214, 632, 'KESTREL AI', 11, COLORS.info, 700));
  body.push(text(214, 683, 'XAUUSD  ·  TECHNICAL READ', 19, COLORS.fg, 700));
  body.push(
    text(214, 731, 'The structure is constructive while price holds', 17, COLORS.muted, 500),
  );
  body.push(text(214, 761, 'above the highlighted demand area.', 17, COLORS.muted, 500));
  body.push(rect(214, 804, 222, 76, COLORS.panel, 2, COLORS.border));
  body.push(text(236, 832, 'BIAS', 10, COLORS.subtle, 700));
  body.push(text(236, 864, 'BULLISH', 18, COLORS.bull, 700));
  body.push(rect(456, 804, 222, 76, COLORS.panel, 2, COLORS.border));
  body.push(text(478, 832, 'RSI14', 10, COLORS.subtle, 700));
  body.push(text(478, 864, '58.4', 18, COLORS.fg, 700));
  body.push(rect(698, 804, 222, 76, COLORS.panel, 2, COLORS.border));
  body.push(text(720, 832, 'STRUCTURE', 10, COLORS.subtle, 700));
  body.push(text(720, 864, 'BOS UP', 18, COLORS.bull, 700));
  body.push(text(214, 944, 'KEY LEVELS', 11, COLORS.subtle, 700));
  body.push(text(214, 980, 'Support  2,318.40', 17, COLORS.fg, 600));
  body.push(text(600, 980, 'Resistance  2,356.80', 17, COLORS.fg, 600));

  body.push(text(72, 1105, 'QUICK PROMPTS', 13, COLORS.subtle, 700));
  const prompts = ['Explain the trend', 'Find key levels', 'Review my risk'];
  prompts.forEach((label, i) => {
    const x = 72 + i * 302;
    body.push(rect(x, 1140, 278, 62, COLORS.panel, 2, COLORS.border));
    body.push(text(x + 22, 1178, label, 16, COLORS.fg, 600));
    body.push(text(x + 252, 1178, '→', 20, COLORS.brand, 700, 'end'));
  });

  body.push(rect(72, 1280, 936, 178, COLORS.panel, 2, COLORS.border));
  body.push(text(104, 1322, 'NEW MESSAGE', 11, COLORS.subtle, 700));
  body.push(text(104, 1370, 'Ask Kestrel anything about your markets...', 18, COLORS.muted, 500));
  body.push(rect(884, 1360, 80, 54, COLORS.brand, 2));
  body.push(text(924, 1396, '↑', 25, COLORS.onBrand, 700, 'middle'));
  body.push(text(104, 1428, '⌘ K  Commands', 12, COLORS.subtle, 500));

  body.push(text(72, 1585, 'BUILT FOR DECISIONS', 13, COLORS.brand, 700));
  body.push(heading(72, 1632, 'Clear answers. Measured risk.', 27, COLORS.fg, 700));
  body.push(
    text(72, 1672, 'No noise. No guesswork. Just a better trading process.', 16, COLORS.muted, 500),
  );

  return shell(body.join('\n'));
}

export function dashboardSvg() {
  const body = [];
  body.push(text(72, 200, 'DASHBOARD', 13, COLORS.brand, 700));
  body.push(heading(72, 248, 'Good morning, trader.', 38, COLORS.fg, 700));
  body.push(text(72, 292, 'A focused view of what matters now.', 18, COLORS.muted, 500));

  body.push(rect(72, 370, 936, 194, COLORS.panel, 2, COLORS.border));
  body.push(text(104, 412, 'MARKET PULSE', 11, COLORS.subtle, 700));
  body.push(text(104, 458, 'XAUUSD', 23, COLORS.fg, 700));
  body.push(text(104, 508, '2,341.28', 38, COLORS.fg, 700));
  body.push(text(340, 506, '+0.84%', 18, COLORS.bull, 700));
  body.push(text(930, 412, 'OPEN', 12, COLORS.bull, 700, 'end'));
  body.push(
    path(
      'M 548 505 C 590 470, 620 488, 660 452 S 735 470, 770 420 S 845 438, 892 385 S 936 405, 976 366',
      COLORS.bull,
      4,
    ),
  );
  body.push(line(548, 520, 976, 520, COLORS.border, 1));

  body.push(text(72, 646, 'WATCHLIST', 13, COLORS.subtle, 700));
  const rows = [
    ['XAUUSD', '2,341.28', '+0.84%', COLORS.bull],
    ['EURUSD', '1.0842', '+0.31%', COLORS.bull],
    ['GBPUSD', '1.2718', '-0.18%', COLORS.bear],
    ['BTCUSDT', '68,420', '+1.12%', COLORS.bull],
  ];
  rows.forEach((row, i) => {
    const y = 690 + i * 84;
    body.push(rect(72, y, 936, 64, i === 0 ? COLORS.elevated : COLORS.panel, 2, COLORS.border));
    body.push(text(100, y + 40, row[0], 18, COLORS.fg, 700));
    body.push(text(510, y + 40, row[1], 17, COLORS.fg, 600));
    body.push(text(930, y + 40, row[2], 17, row[3], 700, 'end'));
    body.push(text(972, y + 40, '›', 24, COLORS.subtle, 500));
  });

  body.push(text(72, 1080, 'AI BRIEFING', 13, COLORS.subtle, 700));
  body.push(rect(72, 1124, 936, 310, COLORS.elevated, 2, COLORS.border));
  body.push(rect(104, 1160, 42, 42, COLORS.brand, 2));
  body.push(text(125, 1188, '✦', 22, COLORS.onBrand, 700, 'middle'));
  body.push(text(170, 1188, "TODAY'S FOCUS", 12, COLORS.brand, 700));
  body.push(text(104, 1250, 'Gold is holding a constructive intraday bias.', 22, COLORS.fg, 650));
  body.push(
    text(104, 1292, 'Watch the 2,318 area for invalidation and avoid', 17, COLORS.muted, 500),
  );
  body.push(text(104, 1322, 'chasing strength into nearby resistance.', 17, COLORS.muted, 500));
  body.push(rect(104, 1360, 210, 42, COLORS.panel, 2, COLORS.border));
  body.push(text(128, 1387, 'Ask follow-up  →', 15, COLORS.fg, 600));

  body.push(text(72, 1530, 'SESSION STATUS', 13, COLORS.subtle, 700));
  const stats = [
    ['Liquidity', 'HIGH', COLORS.bull],
    ['Risk mode', 'BALANCED', COLORS.info],
    ['Next event', '14:00 UTC', COLORS.warn],
  ];
  stats.forEach((stat, i) => {
    const x = 72 + i * 302;
    body.push(rect(x, 1574, 278, 104, COLORS.panel, 2, COLORS.border));
    body.push(text(x + 22, 1608, stat[0], 12, COLORS.subtle, 600));
    body.push(text(x + 22, 1650, stat[1], 17, stat[2], 700));
  });

  body.push(text(72, 1758, 'ONE TERMINAL. A CALMER PROCESS.', 13, COLORS.brand, 700));

  return shell(body.join('\n'));
}

export const PORTRAIT_SHOTS = Object.freeze([
  { file: 'chat.png', width: WIDTH, height: HEIGHT, formFactor: 'narrow', svg: chatSvg() },
  {
    file: 'dashboard.png',
    width: WIDTH,
    height: HEIGHT,
    formFactor: 'narrow',
    svg: dashboardSvg(),
  },
]);
