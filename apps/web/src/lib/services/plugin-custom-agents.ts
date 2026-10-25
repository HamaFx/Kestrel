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

// Route-boundary adapter for the generic plugin user-agent catalog.
//
// API routes must not import @kestrel/* directly; this service is the single
// place that knows about the AI package's custom-agent helpers.

import 'server-only';

export {
  getInstalledPluginRuntime,
  hasUserAgentCatalogs,
  parseCustomAgentMention,
  resolveUserCustomAgent,
  stripCustomAgentMention,
  type CustomAgentDescriptor,
  type InstalledPluginRuntime,
} from '@kestrel/ai/plugins';
