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

// Eval harness orchestrator — POSTs acceptance prompts to /api/chat,
// captures streamed output/tool traces, and writes Markdown + JSON reports.
//
// CLI:
//   tsx packages/ai/src/eval/runner.ts --base-url http://localhost:3000 \
//     --cookie "hfx_auth=..." --out docs/eval --timeout 120000

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushMetrics } from '@kestrel/shared/metrics-export';

import { evaluateAssertions } from './assertions';
import { defaultPromptsPath, loadPrompts } from './dataset-loader';
import { emitEvalMetrics } from './eval-metrics';
import {
  DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS,
  evaluateEvalQualityGate,
  thresholdsFromEnv,
} from './quality-gate';
import { calculateScore, writeJsonReport, writeReport } from './reporter';
import { runOnePrompt } from './run-one-prompt';
import type { PromptResult, RunEvalsArgs, RunEvalsResult } from './types';

export { computeCitationScore } from './citation-oracle';
export type {
  AssertionFailure,
  EvaluationScore,
  PromptDef,
  PromptResult,
  RunEvalsArgs,
  RunEvalsResult,
} from './types';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_OUT_DIR = 'docs/eval';

export async function runEvals(args: RunEvalsArgs): Promise<RunEvalsResult> {
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const promptsPath = args.promptsPath ?? defaultPromptsPath();
  const log = args.onProgress ?? ((line: string): void => console.info(line));

  const prompts = await loadPrompts(promptsPath);
  const total = prompts.length;
  const results: PromptResult[] = [];

  for (let i = 0; i < total; i++) {
    const prompt = prompts[i];
    if (!prompt) continue;
    const result = await runOnePrompt({
      prompt,
      baseUrl: args.baseUrl,
      cookie: args.cookie,
      timeoutMs,
    });
    if (
      result.ok &&
      (prompt.expectedTools ||
        prompt.forbiddenTools ||
        prompt.mustContainSubstrings ||
        prompt.analysisMode ||
        prompt.expectedAgents ||
        prompt.expectedAgentStatuses ||
        prompt.expectedTerminalStatus ||
        prompt.expectedToolOutputs ||
        prompt.quality)
    ) {
      result.assertions = evaluateAssertions(prompt, result);
    }
    results.push(result);
    const failedAssertions = result.assertions?.length ?? 0;
    const tag = !result.ok
      ? 'FAIL'
      : failedAssertions > 0
        ? `OK (${failedAssertions} assertion fail${failedAssertions === 1 ? '' : 's'})`
        : 'OK';
    log(`[${i + 1}/${total}] ${prompt.id} ${result.totalMs}ms ${tag}`);
  }

  const score = calculateScore(results);
  const qualityGate = evaluateEvalQualityGate(
    results,
    args.qualityGate ?? DEFAULT_EVAL_QUALITY_GATE_THRESHOLDS,
  );
  const reportPath = await writeReport({
    outDir: args.outDir,
    baseUrl: args.baseUrl,
    results,
    score,
    qualityGate,
  });
  const jsonPath = await writeJsonReport({
    reportPath,
    baseUrl: args.baseUrl,
    results,
    score,
    qualityGate,
  });

  return { results, reportPath, jsonPath, score, qualityGate };
}

// --- per-prompt fetch ------------------------------------------------------
// --- CLI -------------------------------------------------------------------

interface CliFlags {
  baseUrl: string;
  cookie: string;
  outDir: string;
  timeoutMs: number;
  promptsPath: string | null;
  useCases: boolean;
  help: boolean;
}

function parseCliFlags(argv: string[]): CliFlags | { help: true } {
  const flags: CliFlags = {
    baseUrl: DEFAULT_BASE_URL,
    cookie: process.env.EVAL_COOKIE ?? '',
    outDir: DEFAULT_OUT_DIR,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    promptsPath: null,
    useCases: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      continue;
    }
    if (arg === '--cases') {
      flags.useCases = true;
      continue;
    }
    const next = argv[i + 1];
    if (arg === '--base-url') {
      if (!next) throw new Error('--base-url requires a value');
      flags.baseUrl = next;
      i++;
    } else if (arg === '--cookie') {
      if (!next) throw new Error('--cookie requires a value');
      flags.cookie = next;
      i++;
    } else if (arg === '--out') {
      if (!next) throw new Error('--out requires a value');
      flags.outDir = next;
      i++;
    } else if (arg === '--prompts') {
      if (!next) throw new Error('--prompts requires a value');
      flags.promptsPath = next;
      i++;
    } else if (arg === '--timeout') {
      if (!next) throw new Error('--timeout requires a value');
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`--timeout must be a positive integer (got "${next}")`);
      }
      flags.timeoutMs = parsed;
      i++;
    } else if (arg !== undefined && arg.startsWith('--')) {
      throw new Error(`unknown flag: ${arg}`);
    }
  }

  return flags;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage: tsx packages/ai/src/eval/runner.ts [options]',
      '',
      'Options:',
      '  --base-url <url>   Base URL of the running app (default: http://localhost:3000)',
      '  --cookie <value>   Full Cookie header value (or set EVAL_COOKIE)',
      '  --out <dir>        Directory for the markdown report (default: docs/eval)',
      '  --timeout <ms>     Per-prompt abort timeout in ms (default: 120000)',
      '  --cases            Use cases.json (with assertions) instead of prompts.json',
      '  --prompts <path>   Override the prompts file path explicitly',
      '  -h, --help         Print this message and exit',
      '',
      'Reads prompts from packages/ai/src/eval/prompts.json (or cases.json',
      'with --cases). Writes <out>/<UTC-timestamp>.md. Exits 0 when every',
      'prompt succeeds AND every assertion passes, non-zero otherwise.',
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  let flags: CliFlags | { help: true };
  try {
    flags = parseCliFlags(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n\n`);
    printUsage();
    process.exit(2);
  }

  if ('help' in flags && flags.help) {
    printUsage();
    process.exit(0);
  }

  const f = flags as CliFlags;
  if (!f.cookie || f.cookie.length === 0) {
    process.stderr.write(
      'error: missing cookie. Pass --cookie "hfx_auth=..." or set EVAL_COOKIE.\n',
    );
    process.exit(1);
  }

  const promptsPath =
    f.promptsPath ??
    (f.useCases
      ? fileURLToPath(new URL('./cases.json', import.meta.url))
      : fileURLToPath(new URL('./prompts.json', import.meta.url)));

  const { results, reportPath, jsonPath, score, qualityGate } = await runEvals({
    baseUrl: f.baseUrl,
    cookie: f.cookie,
    outDir: f.outDir,
    timeoutMs: f.timeoutMs,
    promptsPath,
    qualityGate: thresholdsFromEnv(),
  });

  const failed = results.filter((r) => !r.ok).length;
  const dirty = results.filter((r) => r.ok && (r.assertions?.length ?? 0) > 0).length;
  process.stdout.write(`\nReport: ${reportPath}\n`);
  process.stdout.write(`JSON:   ${jsonPath}\n`);
  process.stdout.write(
    `Score: ${(score.overallPassRate * 100).toFixed(1)}% overall, ${(score.transportPassRate * 100).toFixed(1)}% transport\n`,
  );
  process.stdout.write(
    `Done. ${results.length - failed}/${results.length} succeeded, ${failed} failed${dirty > 0 ? `, ${dirty} with assertion failures` : ''}.\n`,
  );

  // Export the eval SLI to Grafana (no-op when GRAFANA_CLOUD_* env is absent)
  // so the nightly run feeds the eval-success SLO.
  emitEvalMetrics(results);
  await flushMetrics();

  process.exit(failed > 0 || dirty > 0 || !qualityGate.passed ? 1 : 0);
}

// Only run main() when this file is executed directly (not when imported).
if (isDirectExecution()) {
  void main();
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const here = fileURLToPath(import.meta.url);
    return resolve(entry) === resolve(here);
  } catch {
    return false;
  }
}
