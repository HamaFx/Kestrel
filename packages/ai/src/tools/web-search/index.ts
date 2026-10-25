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

// Fundamental-agent web research barrel.
//
// The providers are intentionally implemented behind a small native-fetch
// adapter instead of importing an SDK. This keeps provider keys server-only,
// avoids a dependency for each optional provider, and makes response parsing
// and failure behavior testable in isolation.
//
//   - types.ts      — input schema, config shape, provider records, ToolIOMap
//   - values.ts     — untrusted-value coercion helpers
//   - config.ts     — env-derived provider order, keys, and bounds
//   - cache.ts      — in-process result cache + cache-key derivation
//   - normalize.ts  — provider records → deduplicated, sanitized sources
//   - http.ts       — bounded, allowlisted provider HTTP
//   - providers.ts  — Exa / Tavily / Brave adapters
//   - tool.ts       — the `web_search` tool definition

// Side-effect import: registers the `web_search` entry on the shared ToolIOMap.
import './types';

export { isAllowedWebSearchProviderUrl } from './http';
export { normalizeWebSearchResults } from './normalize';
export { buildSearchCacheKey } from './cache';
export { webSearchTool } from './tool';
