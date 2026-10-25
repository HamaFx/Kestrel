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

// Bridge plugin-declared indicators into the core IndicatorRegistry.
//
// `@kestrel/indicators` deliberately does not depend on the plugin host, so
// the AI/bootstrap layer performs the registration. `IndicatorRegistry`
// accepts any runtime kind; the `IndicatorKind` union is the compile-time
// list of core kinds, and plugin kinds extend it at runtime.

import { indicatorRegistry } from '@kestrel/indicators';
import { pluginHost } from '@kestrel/plugin-sdk';

/**
 * Register every plugin indicator on the core registry. Idempotent: a
 * re-registration overwrites the same kind, which is what hot reload and
 * tests expect.
 */
export function syncPluginIndicators(): void {
  for (const indicator of pluginHost.getIndicators()) {
    indicatorRegistry.register({
      kind: indicator.kind as never,
      description: indicator.description,
      paramsSchema: indicator.paramsSchema,
      compute: (candles, params) => indicator.compute(candles, params),
    });
  }
}
