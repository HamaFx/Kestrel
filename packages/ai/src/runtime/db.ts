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

// AI-internal database accessor.
//
// `@kestrel/db` owns the single client, tenant/admin RLS scope resolution, and
// the worker admin fallback. Keeping this module as a thin delegation preserves
// the `@ai/runtime/db` import path without a second DI layer. It is not
// re-exported from the package barrel; applications import `@kestrel/db`.

export { getDb } from '@kestrel/db';
