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

// Notification delivery barrel (DEC-05 split of delivery.ts) for email,
// Telegram, and web-push channels. Re-exports the former module surface:
// `deliverAlert`, `escapeMd`, `sendDirectNotification`, and the
// `DeliveryResult` shape.
//
// Importing `./orchestrate` also evaluates `./adapters` and registers the
// core `email` and `web-push` channels into `alertChannelRegistry` (bottom of
// orchestrate.ts) — the same load-time side effect the original module had.

export type { DeliveryResult } from './types';
export { deliverAlert } from './orchestrate';
export { escapeMd } from './render';
export { sendDirectNotification } from './direct';
