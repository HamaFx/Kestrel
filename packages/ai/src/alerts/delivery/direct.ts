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

// Direct notifications (DEC-05 split from delivery.ts) — a one-off
// subject/body send used by budget and system alerts. Unlike `deliverAlert`
// this path has no alert row, noise gate, or markFired write.

import { logErrorContext } from '@kestrel/shared/logger';

import { TELEGRAM_API } from './context';
import { escapeMd } from './render';

export async function sendDirectNotification(
  subject: string,
  body: string,
  env: {
    RESEND_API_KEY?: string;
    ALERT_FROM_EMAIL?: string;
    ALERT_TO_EMAIL?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
  },
  channels: ('email' | 'telegram')[],
): Promise<{ emailSent: boolean; telegramSent: boolean }> {
  let emailSent = false;
  let telegramSent = false;

  if (
    channels.includes('email') &&
    env.RESEND_API_KEY &&
    env.ALERT_FROM_EMAIL &&
    env.ALERT_TO_EMAIL
  ) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: env.ALERT_FROM_EMAIL,
          to: [env.ALERT_TO_EMAIL],
          subject,
          text: body,
        }),
      });
      emailSent = res.ok;
    } catch (err) {
      logErrorContext(err, 'alerts/direct_email_failed', {}, 'email');
    }
  }

  if (channels.includes('telegram') && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      const text = `*${escapeMd(subject)}*\n\n${escapeMd(body)}`;
      const res = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'MarkdownV2',
        }),
      });
      telegramSent = res.ok;
    } catch (err) {
      logErrorContext(err, 'alerts/direct_telegram_failed', {}, 'telegram');
    }
  }

  return { emailSent, telegramSent };
}
