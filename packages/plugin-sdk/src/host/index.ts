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

// Plugin host — barrel for the split modules.
//
// Every name previously exported from `src/host.ts` is re-exported here so
// `./host`, `../src/host` and the package barrel keep resolving, and the
// `pluginHost` singleton stays a single global instance.

export {
  PluginHost,
  pluginHost,
  type RegisteredPlugin,
  type ResolveToolsOptions,
} from './plugin-host';
