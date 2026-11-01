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

// R14 — one per-tool deadline table for both the legacy registry and the
// Mastra-native read-only path.

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TOOL_TIMEOUT_MS,
  resolveToolTimeoutMs,
  ToolTimeoutError,
} from '../src/tools/tool-timeout';

describe('resolveToolTimeoutMs', () => {
  it('defaults to the shared 25s deadline', () => {
    expect(resolveToolTimeoutMs('some_unlisted_tool')).toBe(DEFAULT_TOOL_TIMEOUT_MS);
    expect(DEFAULT_TOOL_TIMEOUT_MS).toBe(25_000);
  });

  it('applies the legacy registry override by name', () => {
    expect(resolveToolTimeoutMs('get_price')).toBe(5_000);
    expect(resolveToolTimeoutMs('get_candles')).toBe(10_000);
    expect(resolveToolTimeoutMs('get_indicators')).toBe(10_000);
  });

  it('applies the same override to the qualified Mastra tool id', () => {
    expect(resolveToolTimeoutMs('kestrel-get_price')).toBe(5_000);
    expect(resolveToolTimeoutMs('kestrel-analyze_chart_image')).toBe(45_000);
  });

  it('keeps the slow-tool overrides', () => {
    expect(resolveToolTimeoutMs('analyze_chart_image')).toBe(45_000);
    expect(resolveToolTimeoutMs('replay_setup')).toBe(40_000);
  });

  it('exposes a stable TIMEOUT code for telemetry', () => {
    const error = new ToolTimeoutError('get_price', 5_000);
    expect(error.code).toBe('TIMEOUT');
    expect(error.name).toBe('ToolTimeoutError');
  });
});
