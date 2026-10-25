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

// Macro evidence for the research packet: XAUUSD (FRED/Dollar/news/calendar)
// and the M-02 generic extension for every other symbol.
//
//   - limits.ts           — shared windows and limits
//   - schemas.ts          — M-02 generic macro extension schema
//   - fetch.ts            — best-effort provider collection
//   - generic-assemble.ts — generic extension assembly (news/calendar/COT)
//   - xauusd-assemble.ts  — XAUUSD verified macro evidence

export { GenericMacroExtensionSchema, type GenericMacroExtension } from './schemas';
export {
  fetchGenericMacroData,
  fetchXauusdMacroData,
  type GenericMacroFetchResult,
  type XauusdMacroFetchResult,
} from './fetch';
export { assembleGenericMacroExtension } from './generic-assemble';
export { assembleXauusdMacroEvidence } from './xauusd-assemble';
