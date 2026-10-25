/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Per-user plugin install state and zero-migration plugin storage — barrel for
// the split modules.
//
// Every name previously exported from `src/queries/plugins.ts` is re-exported
// here so `./plugins`, `../queries/plugins`, `queries.plugins.*` and
// `@kestrel/db` imports keep resolving unchanged.

export type {
  InstallPluginInput,
  InstalledPluginRow,
  PluginStorageScope,
  PluginStorageValue,
  UpdatePluginSettingsInput,
} from './types';
export {
  getInstalledPlugin,
  getInstalledPluginIdsForUser,
  installPlugin,
  listEnabledPluginUsers,
  listInstalledPlugins,
  setPluginEnabled,
  uninstallPlugin,
  updatePluginSettings,
} from './installed';
export {
  pluginStorageClear,
  pluginStorageDelete,
  pluginStorageGet,
  pluginStorageList,
  pluginStorageSet,
} from './storage';
