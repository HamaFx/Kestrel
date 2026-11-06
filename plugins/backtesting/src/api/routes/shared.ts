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

// Shared HTTP plumbing
// error mapping, JSON responses, body validation and method dispatch. The
// generic primitives live in `@kestrel/plugin-sdk`.

import { createPluginRouteHelpers, pluginExecCtx, pluginQuery } from '@kestrel/plugin-sdk';

const helpers = createPluginRouteHelpers({
  logLabel: 'backtesting api route failed',
  failureCode: 'BACKTESTING_FAILED',
  failureMessage: 'The Backtesting Lab could not complete this request.',
});

export const { ApiError, json, byMethod, parseBody, wrap } = helpers;

export const execCtx = pluginExecCtx;

export function queryNumber(request: Request, key: string, fallback: number): number {
  const raw = pluginQuery(request).get(key);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
