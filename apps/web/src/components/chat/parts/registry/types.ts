// SPDX-License-Identifier: Apache-2.0

// Shared contracts for the tool-part registry. The mapped types below are the
// compile-time guarantee: one entry per CORE `ToolName`, so adding a tool to
// `TOOL_NAMES` without wiring a part is a TypeScript error.

import type { CoreToolName, ToolOutput } from '@kestrel/shared';
import type { ComponentType } from 'react';
import type { z } from 'zod';

/** State a part is in for the duration of a streamed tool call. */
export type ToolPartState = 'loading' | 'done' | 'error';

/**
 * The prop contract every bespoke part conforms to. Generic in the tool
 * name so `partRegistry` can be a typed map: each entry's `output` is the
 * matching `ToolOutput<K>` (or `null` while loading / on error).
 */
export interface ToolPartProps<T extends CoreToolName> {
  /** Tool output, or `null` while streaming / before completion. */
  output: ToolOutput<T> | null;
  state: ToolPartState;
  errorMessage?: string;
}

/**
 * Typed component map, one entry per CORE `ToolName`. The mapped type
 * `{ [K in CoreToolName]: ComponentType<ToolPartProps<K>> }` enforces
 * totality at compile time — extending `TOOL_NAMES` without adding the
 * matching part here is a TS error. Plugin tools use
 * `AutoPluginToolCard`/plugin UI instead.
 */
export type PartRegistryMap = { [K in CoreToolName]: ComponentType<ToolPartProps<K>> };

/**
 * Per-tool zod schemas keyed by CORE `ToolName`. Used to `safeParse` the raw
 * stream payload before handing it to a bespoke part — a malformed result
 * routes to the generic fallback rather than crashing the part.
 */
export type PartSchemaMap = { [K in CoreToolName]: z.ZodType<ToolOutput<K>> };

export interface ChatToolPartProps {
  /**
   * Raw tool name as emitted by the AI stream (without the `tool-` prefix).
   * Typed `string` so core names dispatch to bespoke parts while plugin tool
   * ids are accepted without touching this file.
   */
  name: string;
  /** Raw tool result. zod-parsed per-tool before reaching the bespoke part. */
  output: unknown;
  state: ToolPartState;
  errorMessage?: string;
}
