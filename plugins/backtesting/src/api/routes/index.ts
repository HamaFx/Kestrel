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

// Authenticated Backtesting Lab HTTP routes.
//
// Mounted by the core at /api/plugins/backtesting/<path>. The dispatcher has
// already authenticated the user, resolved the tenant, decrypted settings and
// verified that this plugin is installed — these handlers only own validation
// and the response shape.
//
// This barrel keeps the previous `api/routes` import path working.

import type { PluginApiRouteHandler } from '@kestrel/plugin-sdk';

import { knowledgeRoutes } from './knowledge';
import { runRoutes } from './runs';
import { strategyRoutes } from './strategies';
import { summaryRoutes } from './summary';
import { sweepRoutes } from './sweeps';

export const backtestingApiRoutes: Readonly<Record<string, PluginApiRouteHandler>> = {
  ...runRoutes,
  ...sweepRoutes,
  ...strategyRoutes,
  ...knowledgeRoutes,
  ...summaryRoutes,
};
