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

// Canonical Mastra chat agent. Public surface unchanged; implementation is
// split across allowlist, prompts, setup, correction, buffered, and stream.

export { CANONICAL_READ_ONLY_TOOL_NAMES, assertCanonicalToolAllowlist } from './allowlist';
export type {
  MastraCanonicalChatResult,
  MastraCanonicalChatStream,
  RunMastraCanonicalChatArgs,
} from './types';
export { runMastraCanonicalChat } from './chat';
export { runMastraCanonicalChatStream } from './stream';
