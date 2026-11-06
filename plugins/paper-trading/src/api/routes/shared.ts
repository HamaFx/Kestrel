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

// Authenticated Paper Trading HTTP routes
//
// Mounted at /api/plugins/paper-trading/<path> by the core plugin dispatcher.
// The generic primitives live in `@kestrel/plugin-sdk`.

import { createPluginRouteHelpers, pluginQuery } from '@kestrel/plugin-sdk';

const helpers = createPluginRouteHelpers({
  logLabel: 'paper trading api route failed',
  failureCode: 'PAPER_TRADING_FAILED',
  failureMessage: 'The Paper Trading broker could not complete this request.',
});

export const { ApiError, json, byMethod, parseBody, wrap } = helpers;

export function queryObject(request: Request): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of pluginQuery(request).entries()) result[key] = value;
  return result;
}
