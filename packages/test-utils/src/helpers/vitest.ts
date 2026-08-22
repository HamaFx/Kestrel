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

import { vi } from 'vitest';

export function installServerOnlyStub(): void {
  vi.mock('server-only', () => ({}));
}

export interface TestEnvVars {
  [key: string]: string;
}

export function setupTestEnvironment(env?: TestEnvVars): void {
  if (env) {
    Object.entries(env).forEach(([key, value]) => {
      process.env[key] = value;
    });
  }
}

export function teardownTestEnvironment(envKeys?: string[]): void {
  if (envKeys) {
    envKeys.forEach((key) => {
      delete process.env[key];
    });
  }
}

export function freezeTime(epochMs: number): void {
  vi.setSystemTime(new Date(epochMs));
}

export function advanceTime(ms: number): void {
  vi.advanceTimersByTime(ms);
}

export function useFakeTimers(): void {
  vi.useFakeTimers();
}

export function useRealTimers(): void {
  vi.useRealTimers();
}
