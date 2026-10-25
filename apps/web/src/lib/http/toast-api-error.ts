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

import { toast } from 'sonner';

import { ApiError } from './api-client';

/**
 * Show a toast that consistently surfaces the `x-request-id` header when
 * the error is an `ApiError`. This makes every admin tab traceable to a
 * single server log line — the Cron table already does this; this helper
 * makes it trivial for the other tabs to follow suit.
 *
 * Usage:
 *   } catch (err) {
 *     toastApiError(err, 'Failed to load cron history');
 *   }
 */
export function toastApiError(err: unknown, fallback: string): void {
  const msg = err instanceof Error ? err.message : fallback;
  if (err instanceof ApiError && err.requestId) {
    toast.error(msg, { description: `Ref: ${err.requestId}` });
  } else {
    toast.error(msg);
  }
}
