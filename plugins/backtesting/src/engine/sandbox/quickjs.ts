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

// Lazy QuickJS WebAssembly loader shared by every sandbox run.

import type { QuickJSWASMModule } from 'quickjs-emscripten';

export type QuickJSModule = QuickJSWASMModule;

let quickJSLoader: Promise<QuickJSModule> | null = null;

export async function loadQuickJS(): Promise<QuickJSModule> {
  quickJSLoader ??= import('quickjs-emscripten').then((mod) => mod.getQuickJS());
  return quickJSLoader;
}
