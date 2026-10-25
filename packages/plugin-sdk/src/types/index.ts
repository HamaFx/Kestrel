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

// Public plugin contract — barrel for the split type groups.
//
// Every name previously exported from `src/types.ts` is re-exported here so
// `./types`, `../types` and `@kestrel/plugin-sdk` imports keep resolving.

export * from './core';
export * from './tools';
export * from './agents';
export * from './jobs';
export * from './ticks';
export * from './alert-channels';
export * from './market-data';
export * from './api-routes';
export * from './manifest';
export * from './registered';
