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

// Shared helpers for BYOK provider definitions. Imported by individual provider
// spec files to keep them focused on data declarations.
//
//   - types.ts           — normalized HCNSEC tool call shape
//   - tool-arguments.ts  — HCNSEC argument-alias repair
//   - dsml.ts            — DSML text tool-call parsing
//   - json-payload.ts    — non-streaming payload normalization
//   - sse.ts             — streaming event normalization
//   - fetch.ts           — bounded HCNSEC fetch wrapper
//   - capabilities.ts    — capability sets, factory, spec validator

export type { HcnsecToolCall } from './types';
export { normalizeHcnsecToolArguments } from './tool-arguments';
export { normalizeHcnsecDsmlToolCalls } from './dsml';
export { normalizeHcnsecJsonPayload } from './json-payload';
export { normalizeHcnsecSse } from './sse';
export { hcnsecFetch } from './fetch';
export { CAPS_FULL, CAPS_TEXT, openaiCompatibleFactory, defineProvider } from './capabilities';
