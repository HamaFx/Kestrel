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

// QuickJS sandbox limits and the user-safe sandbox error class.

import type { SandboxLimits } from '../types';

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  maxSignals: 2_000,
  maxLogs: 200,
  timeoutMs: 5_000,
  memoryBytes: 96 * 1024 * 1024,
  stackBytes: 1024 * 1024,
};

export class StrategySandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrategySandboxError';
  }
}
