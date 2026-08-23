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

import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    // esbuild does not recognise ES2024; the TS target in packages/config
    // pins the type-check target while this tells esbuild to emit ES2022
    // (latest stable) on transform.
    target: 'es2022',
  },
  test: {
    server: {
      deps: {
        inline: ['server-only'],
      },
    },
  },
});
