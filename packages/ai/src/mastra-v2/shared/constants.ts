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

export const MASTRA_XAUUSD_AGENT_ID = 'kestrel-xauusd-research-poc';
export const MASTRA_XAUUSD_AGENT_VERSION = 'poc-3';

/**
 * A-01 (audit 2026-10-18, B-01/B-08) — cross-symbol comparison cap. A prompt
 * naming 2–3 supported symbols routes to `multi-symbol-research`; more than
 * this many is disambiguated at the chat boundary instead of silently
 * collecting every packet.
 */
export const MAX_COMPARISON_SYMBOLS = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Centralised timing/port constants (P-05, audit 2026-10-18). These values
// previously lived in three modules; the definition sites now re-export from
// here so operators read one file.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Committee deadline for synchronous runs (audit plan §1.7). Leaves ~10s of
 * headroom under the chat route's 55s window so a deadline surfaces as an
 * explicit strict failure instead of an opaque route abort. Durable worker
 * runs are lease-governed and omit it.
 */
export const COMMITTEE_DEADLINE_MS = 45_000;

/** Durable Full-analysis queue lease; worker heartbeats renew ownership. */
export const FULL_ANALYSIS_LEASE_MS = 90_000;

/** Q5 decision: 30s fresh-only symbol-research packet cache TTL. */
export const PACKET_CACHE_TTL_MS = 30_000;

/** Default port for the standalone Mastra Studio server. */
export const MASTRA_DEFAULT_PORT = 4111;
