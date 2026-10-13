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

// SPDX-License-Identifier: Apache-2.0

/**
 * Q2 decision (docs/plans/decisions.log.md): exactly two analysis modes —
 * `single` (one technical desk, instant read) and `full` (4-desk committee).
 *
 * Lives outside the chat components so both server and client code can
 * import it: exporting plain functions from a 'use client' module makes
 * them client references that throw when a server component calls them.
 */
export type AnalysisMode = 'single' | 'full';

/** Map legacy persisted modes onto the two-mode schema (Q2 compat shim). */
export function normalizeAnalysisMode(mode: string | null | undefined): AnalysisMode {
  switch (mode) {
    case 'full':
    case 'standard':
      return 'full';
    case 'single':
    case 'quick':
    case 'auto':
    default:
      return 'single';
  }
}
