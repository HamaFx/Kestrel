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

export {
  clearInstalledPluginCache,
  createPluginExecutionContext,
  getInstalledPluginRuntime,
  invalidateInstalledPluginCache,
  pluginExecutionContextFor,
  pluginSettingsFor,
  resolvePluginSkills,
  resolvePluginToolsForAgent,
  runWithPluginTenantScope,
  type InstalledPluginRecord,
  type InstalledPluginRuntime,
} from './runtime';
export {
  buildPluginMastraTools,
  mergePluginTools,
  type BuildPluginMastraToolsArgs,
} from './mastra-tools';
export { syncPluginIndicators } from './indicators';
// R14 mid-turn failover metadata must stay nameable through this public
// barrel.
export type { FallbackPartPayload } from '../models/model-fallback';
export {
  detectInstalledPluginIntent,
  type InstalledPluginIntentId,
  type PluginIntentMatch,
} from './intent';
export { enrichPacketForUser, type EnrichablePacket } from './enrichers';
