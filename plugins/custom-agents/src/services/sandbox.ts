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

// Small deterministic script sandbox for custom agents.
//
// This is intentionally not a Node VM: agent-authored JavaScript runs inside
// QuickJS-WASM with no require/fetch/fs/process, a 32 MB memory cap, a stack
// cap and a wall-clock interrupt. It is the lightweight counterpart to the
// Backtesting Lab's strategy sandbox, for calculations and data transforms.

import type { QuickJSWASMModule } from 'quickjs-emscripten';

const MEMORY_BYTES = 32 * 1024 * 1024;
const STACK_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 2_000;
const MAX_SOURCE_CHARS = 20_000;
const MAX_LOGS = 50;

export class ScriptSandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScriptSandboxError';
  }
}

let quickJSLoader: Promise<QuickJSWASMModule> | null = null;

async function loadQuickJS(): Promise<QuickJSWASMModule> {
  quickJSLoader ??= import('quickjs-emscripten').then((mod) => mod.getQuickJS());
  return quickJSLoader;
}

export interface ScriptSandboxResult {
  result: unknown;
  logs: string[];
}

function describeDump(dump: unknown): string {
  if (typeof dump === 'string') return dump;
  if (dump && typeof dump === 'object') {
    const record = dump as Record<string, unknown>;
    if (typeof record['message'] === 'string') {
      return typeof record['stack'] === 'string'
        ? `${record['message']}\n${record['stack']}`
        : record['message'];
    }
    try {
      return JSON.stringify(dump);
    } catch {
      return String(dump);
    }
  }
  return String(dump);
}

/**
 * Run `run(input)` from `source` in QuickJS.
 *
 * Contract: the source must define `function run(input) { ... }` and return a
 * JSON-serialisable value. `console.log/info/warn/error` are captured (max 50
 * lines) and never reach the host process.
 */
export async function runAgentScript(args: {
  source: string;
  input?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<ScriptSandboxResult> {
  const source = args.source.trim();
  if (!source) throw new ScriptSandboxError('Script source is empty.');
  if (source.length > MAX_SOURCE_CHARS) {
    throw new ScriptSandboxError(
      `Script source is larger than ${MAX_SOURCE_CHARS.toLocaleString()} characters.`,
    );
  }
  const timeoutMs = Math.min(10_000, Math.max(100, args.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  let inputJson: string;
  try {
    inputJson = JSON.stringify(args.input ?? {});
  } catch {
    throw new ScriptSandboxError('Script input must be JSON-serialisable.');
  }
  if (inputJson.length > 100_000) {
    throw new ScriptSandboxError('Script input is too large (max 100KB).');
  }

  let quickJS: QuickJSWASMModule;
  try {
    quickJS = await loadQuickJS();
  } catch (err) {
    throw new ScriptSandboxError(
      `The script sandbox is unavailable in this deployment (${
        err instanceof Error ? err.message : String(err)
      }).`,
    );
  }

  const deadline = Date.now() + timeoutMs;
  const runtime = quickJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_BYTES);
  runtime.setMaxStackSize(STACK_BYTES);
  runtime.setInterruptHandler(() => args.signal?.aborted === true || Date.now() > deadline);

  const context = runtime.newContext();
  const script = `
var __logs = [];
function __log(level, values) {
  if (__logs.length >= ${MAX_LOGS}) return;
  var parts = [];
  for (var i = 0; i < values.length; i += 1) {
    var value = values[i];
    try { parts.push(typeof value === 'string' ? value : JSON.stringify(value)); }
    catch (err) { parts.push(String(value)); }
  }
  __logs.push(level + ': ' + parts.join(' '));
}
globalThis.console = {
  log: function () { __log('log', arguments); },
  info: function () { __log('info', arguments); },
  warn: function () { __log('warn', arguments); },
  error: function () { __log('error', arguments); },
  debug: function () { __log('debug', arguments); }
};
var __INPUT = JSON.parse(__INPUT_JSON);
${source}
;
if (typeof run !== 'function') {
  throw new Error('Define function run(input) in your script.');
}
var __RESULT = run(__INPUT);
JSON.stringify({ result: __RESULT === undefined ? null : __RESULT, logs: __logs });
`;

  try {
    const inputHandle = context.newString(inputJson);
    context.setProp(context.global, '__INPUT_JSON', inputHandle);
    inputHandle.dispose();

    const evaluation = context.evalCode(script);
    if (evaluation.error) {
      const dumped = context.dump(evaluation.error);
      evaluation.error.dispose();
      const message = describeDump(dumped);
      if (/interrupted|out of memory/i.test(message)) {
        throw new ScriptSandboxError(
          `Script exceeded the sandbox limits (${timeoutMs}ms / ${Math.round(
            MEMORY_BYTES / (1024 * 1024),
          )}MB).`,
        );
      }
      throw new ScriptSandboxError(message);
    }

    const json = context.getString(evaluation.value);
    evaluation.value.dispose();
    let parsed: { result?: unknown; logs?: unknown };
    try {
      parsed = JSON.parse(json) as { result?: unknown; logs?: unknown };
    } catch {
      throw new ScriptSandboxError('The script sandbox returned an invalid result.');
    }
    const logs = Array.isArray(parsed.logs)
      ? parsed.logs.filter((line): line is string => typeof line === 'string').slice(0, MAX_LOGS)
      : [];
    return { result: parsed.result ?? null, logs };
  } catch (err) {
    if (err instanceof ScriptSandboxError) throw err;
    throw new ScriptSandboxError(err instanceof Error ? err.message : String(err));
  } finally {
    context.dispose();
    runtime.dispose();
  }
}
