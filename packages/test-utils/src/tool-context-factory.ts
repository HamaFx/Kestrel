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

/**
 * Typed tool-context factory (RULE-R03).
 *
 * Tests used to build tool contexts with `{ ... } as any`, which hides
 * contract drift when `ToolContext` gains a required field. Callers pass the
 * concrete context type as the generic argument:
 *
 *   const ctx = createMockToolContext<ToolContext>({ threadId: 't1' });
 *
 * The factory only fills the low-risk defaults; every test-relevant field is
 * an explicit override.
 */

export interface MockToolContextDefaults {
  threadId: string;
  userId: string;
  latestUserMessageText: string;
  env: Record<string, unknown>;
  signal: AbortSignal | null;
  budget: { spent: number; max: number };
  userSettings: Record<string, unknown>;
  toolTelemetryBuffer: unknown[];
}

export function createMockToolContext<T extends object = MockToolContextDefaults>(
  overrides: Partial<T> = {},
): T {
  const defaults: MockToolContextDefaults = {
    threadId: 'test-thread',
    userId: 'test-user',
    latestUserMessageText: '',
    env: {},
    signal: null,
    budget: { spent: 0, max: 10 },
    userSettings: {},
    toolTelemetryBuffer: [],
  };
  return { ...defaults, ...overrides } as T;
}
