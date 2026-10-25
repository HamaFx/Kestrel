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

// Prompt/case file loading + runtime validation.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { PromptDef } from './types';

export function defaultPromptsPath(): string {
  return fileURLToPath(new URL('./prompts.json', import.meta.url));
}

export async function loadPrompts(path: string): Promise<PromptDef[]> {
  const raw = await readFile(path, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`prompts file ${path} must be a JSON array`);
  }
  const out: PromptDef[] = [];
  for (const item of parsed) {
    if (
      typeof item === 'object' &&
      item !== null &&
      'id' in item &&
      'prompt' in item &&
      typeof (item as { id: unknown }).id === 'string' &&
      typeof (item as { prompt: unknown }).prompt === 'string'
    ) {
      const obj = item as {
        id: string;
        prompt: string;
        expectedTools?: unknown;
        forbiddenTools?: unknown;
        mustContainSubstrings?: unknown;
        analysisMode?: unknown;
        expectedAgents?: unknown;
        expectedAgentStatuses?: unknown;
        expectedTerminalStatus?: unknown;
        expectedToolOutputs?: unknown;
        quality?: unknown;
      };
      const def: PromptDef = { id: obj.id, prompt: obj.prompt };
      if (Array.isArray(obj.expectedTools)) {
        def.expectedTools = obj.expectedTools.filter((s): s is string => typeof s === 'string');
      }
      if (Array.isArray(obj.forbiddenTools)) {
        def.forbiddenTools = obj.forbiddenTools.filter((s): s is string => typeof s === 'string');
      }
      if (Array.isArray(obj.mustContainSubstrings)) {
        def.mustContainSubstrings = obj.mustContainSubstrings.filter(
          (s): s is string => typeof s === 'string',
        );
      }
      if (
        obj.analysisMode === 'single' ||
        obj.analysisMode === 'full' ||
        // Q2 compat shim: legacy case files map onto the two-mode schema.
        obj.analysisMode === 'quick' ||
        obj.analysisMode === 'standard' ||
        obj.analysisMode === 'auto'
      ) {
        def.analysisMode =
          obj.analysisMode === 'full' || obj.analysisMode === 'standard' ? 'full' : 'single';
      }
      if (Array.isArray(obj.expectedAgents)) {
        def.expectedAgents = obj.expectedAgents.filter((s): s is string => typeof s === 'string');
      }
      if (obj.expectedAgentStatuses && typeof obj.expectedAgentStatuses === 'object') {
        def.expectedAgentStatuses = Object.fromEntries(
          Object.entries(obj.expectedAgentStatuses).filter(
            (entry): entry is [string, string] =>
              typeof entry[0] === 'string' && typeof entry[1] === 'string',
          ),
        );
      }
      if (
        obj.expectedTerminalStatus === 'complete' ||
        obj.expectedTerminalStatus === 'failed' ||
        obj.expectedTerminalStatus === 'retrying'
      ) {
        def.expectedTerminalStatus = obj.expectedTerminalStatus;
      }
      if (Array.isArray(obj.expectedToolOutputs)) {
        const expected = obj.expectedToolOutputs.filter(isExpectedToolOutput);
        if (expected.length > 0) def.expectedToolOutputs = expected;
      }
      if (isQualityConfig(obj.quality)) def.quality = obj.quality;
      out.push(def);
    } else {
      throw new Error(`prompts file ${path} contains an entry without {id, prompt}`);
    }
  }
  if (out.length === 0) {
    throw new Error(`prompts file ${path} is empty`);
  }
  return out;
}

// --- assertion evaluation --------------------------------------------------

interface ExpectedToolOutput {
  tool: string;
  path: string;
  value: number;
  tolerance?: number;
}

function isExpectedToolOutput(value: unknown): value is ExpectedToolOutput {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.tool === 'string' &&
    typeof item.path === 'string' &&
    typeof item.value === 'number' &&
    Number.isFinite(item.value) &&
    (item.tolerance === undefined || (typeof item.tolerance === 'number' && item.tolerance >= 0))
  );
}

function isQualityConfig(value: unknown): value is NonNullable<PromptDef['quality']> {
  if (typeof value !== 'object' || value === null) return false;
  const config = value as Record<string, unknown>;
  const booleans = ['requireNumericToolSupport', 'requireEventToolSupport'];
  const arrays = ['forbiddenOutputSubstrings', 'requiredOutputSubstrings'];
  const numbers = ['maxTtftMs', 'maxTotalMs', 'maxCostUsd'];
  return (
    booleans.every((key) => config[key] === undefined || typeof config[key] === 'boolean') &&
    arrays.every(
      (key) =>
        config[key] === undefined ||
        (Array.isArray(config[key]) && config[key].every((item) => typeof item === 'string')),
    ) &&
    numbers.every(
      (key) =>
        config[key] === undefined ||
        (typeof config[key] === 'number' && Number.isFinite(config[key]) && config[key] >= 0),
    )
  );
}
