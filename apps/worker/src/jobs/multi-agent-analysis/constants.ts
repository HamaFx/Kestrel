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

// Tunables for the durable full-analysis worker (claim loop, lease
// heartbeat, retry policy, and sweep/retention cadence).

export const MAX_JOBS_PER_RUN = 3;
export const STALE_JOB_TIMEOUT_MS = 5 * 60 * 1000;
export const MAX_ANALYSIS_ATTEMPTS = 3;
// Cancellation and lease ownership are only observed on heartbeats; a shorter
// interval bounds how long a cancelled Full-analysis run keeps working. The
// queue lease is FULL_ANALYSIS_LEASE_MS (90s), so 15s keeps a 6× safety margin.
export const HEARTBEAT_MS = 15_000;
export const RETENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// The poll fires every ~3s; recovery and retention are set-based sweeps that
// do not need that cadence — without a throttle they scan the queue
// ~57k times/day. Recovery: once a minute; retention: once an hour.
export const RECOVERY_INTERVAL_MS = 60_000;
export const RETENTION_INTERVAL_MS = 60 * 60 * 1000;
