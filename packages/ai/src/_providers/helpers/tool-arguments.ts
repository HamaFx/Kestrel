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

// HCNSEC tool-argument repair.

/**
 * Normalize HCNSEC's common aliases to Kestrel tool-input names.
 *
 * DeepSeek-compatible endpoints are often trained/documented with
 * `timeframe`/`limit`, while Kestrel's schemas intentionally use the
 * shorter `tf`/`count` names. Tool-specific defaults belong to the canonical
 * tool schemas, not to this provider wire helper.
 */
export function normalizeHcnsecToolArguments(toolName: string, rawArguments: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments) as unknown;
  } catch {
    return rawArguments;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return rawArguments;

  const args = { ...(parsed as Record<string, unknown>) };
  if (args.tf === undefined && typeof args.timeframe === 'string') {
    args.tf = args.timeframe;
    delete args.timeframe;
  }
  if (args.count === undefined && args.limit !== undefined) {
    args.count = args.limit;
    delete args.limit;
  }
  return JSON.stringify(args);
}
