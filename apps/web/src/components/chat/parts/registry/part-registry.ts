// SPDX-License-Identifier: Apache-2.0

// Merge of the per-phase part groups into the complete registry and schema
// maps. The annotated types keep the compile-time guarantee that every CORE
// `ToolName` has exactly one bespoke part and one output schema.
import type { CoreToolName, ToolOutput } from '@kestrel/shared';
import type { z } from 'zod';

import { advancedParts } from './advanced-tools';
import { analysisParts } from './analysis-tools';
import { marketParts } from './market-tools';
import type { PartRegistryMap, PartSchemaMap } from './types';

/** Typed component map, one entry per CORE `ToolName`. */
export const partRegistry: PartRegistryMap = {
  ...marketParts.registry,
  ...analysisParts.registry,
  ...advancedParts.registry,
};

const partSchemas: PartSchemaMap = {
  ...marketParts.schemas,
  ...analysisParts.schemas,
  ...advancedParts.schemas,
};

export type BespokeParseResult<K extends CoreToolName> =
  { ok: true; data: ToolOutput<K> } | { ok: false };

/**
 * `safeParse` a raw stream payload against the tool's output schema. A
 * malformed result is logged and routed to the generic fallback by the caller.
 */
export function parseBespokeOutput<K extends CoreToolName>(
  name: K,
  output: unknown,
): BespokeParseResult<K> {
  // Same mapped-type index-access limitation as `renderBespoke`: the cast
  // restores the per-K schema type without weakening it to a union.
  const schema = partSchemas[name] as z.ZodType<ToolOutput<K>>;
  const result = schema.safeParse(output);
  if (!result.success) {
    console.warn(`[chat-part] ${name} schema parse failed`, result.error);
    return { ok: false };
  }
  return { ok: true, data: result.data };
}
