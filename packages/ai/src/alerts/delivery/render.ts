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

// Alert message rendering (DEC-05 split from delivery.ts): the email/push
// body and the Telegram MarkdownV2 escaper.
//
// We use MarkdownV2 for Telegram formatting, which requires escaping a
// specific set of reserved characters in any user-controlled text.
// `escapeMd` covers the full set listed in
// https://core.telegram.org/bots/api#markdownv2-style.

import type { Alert } from '@kestrel/shared';

import type { RuleReading } from '../spec';
import { describeRule } from './context';

export function renderEmailBody(alert: Alert, reading: RuleReading): string {
  const lines = [
    describeRule(alert.rule),
    '',
    `Reading: ${reading.value} (source: ${reading.source})`,
    `Trigger level: ${alert.rule.level}`,
  ];
  if (alert.note) {
    lines.push('', 'Note:', alert.note);
  }
  lines.push('', '— Kestrel');
  return lines.join('\n');
}

export function escapeMd(s: string): string {
  return s.replace(/[\\_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
