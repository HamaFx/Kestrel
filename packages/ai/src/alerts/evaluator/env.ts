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

// Alert evaluator environment (DEC-05 split from evaluator.ts).
//
// Provider credentials for the evaluator can come from an explicit `env`
// argument (cron/worker boundary) or from `process.env`. This leaf module
// owns just that shape so delivery can import it without a cycle.

export interface EvaluatorEnv {
  RESEND_API_KEY?: string | undefined;
  ALERT_FROM_EMAIL?: string | undefined;
  ALERT_TO_EMAIL?: string | undefined;
  TELEGRAM_BOT_TOKEN?: string | undefined;
  TELEGRAM_CHAT_ID?: string | undefined;
  /** VAPID keypair for the web-push channel (RFC 8292). */
  VAPID_PUBLIC_KEY?: string | undefined;
  VAPID_PRIVATE_KEY?: string | undefined;
  VAPID_SUBJECT?: string | undefined;
}
