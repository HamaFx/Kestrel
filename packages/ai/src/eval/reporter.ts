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

// Markdown + machine-readable eval report writers and scoring.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import { computeDrift } from './drift';
import type { EvalQualityGateResult } from './quality-gate';
import type { EvaluationScore, PromptResult } from './types';

interface WriteReportArgs {
  outDir: string;
  baseUrl: string;
  results: PromptResult[];
  score: EvaluationScore;
  qualityGate: EvalQualityGateResult;
}

const MAX_OUTPUT_CHARS = 2000;

export async function writeReport(args: WriteReportArgs): Promise<string> {
  const { outDir, baseUrl, results, score, qualityGate } = args;
  const stamp = utcStamp(new Date());
  const reportPath = isAbsolute(outDir)
    ? resolve(outDir, `${stamp}.md`)
    : resolve(process.cwd(), outDir, `${stamp}.md`);

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    buildMarkdown({ baseUrl, results, stamp, score, qualityGate }),
    'utf-8',
  );
  return reportPath;
}

interface WriteJsonReportArgs {
  /** Markdown report path the JSON file is written alongside. */
  reportPath: string;
  baseUrl: string;
  results: PromptResult[];
  score: EvaluationScore;
  qualityGate: EvalQualityGateResult;
}

/**
 * Write a machine-readable JSON report next to the Markdown report.
 *
 * Phase C — structured domain oracles: the same run envelope (score,
 * per-prompt result, assertions, tool calls, metadata) must be consumable
 * by dashboards, drift tooling, and regression gates without parsing
 * Markdown. The schema is versioned (`kestrel.eval-report.v1`) so
 * downstream consumers can migrate independently.
 */
export async function writeJsonReport(args: WriteJsonReportArgs): Promise<string> {
  const { reportPath, baseUrl, results, score, qualityGate } = args;
  const jsonPath = reportPath.endsWith('.md')
    ? `${reportPath.slice(0, -3)}.json`
    : `${reportPath}.json`;

  const payload = {
    schemaVersion: 'kestrel.eval-report.v1',
    generatedAt: new Date().toISOString(),
    baseUrl,
    score,
    qualityGate,
    drift: computeDrift(results),
    results,
  };

  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  return jsonPath;
}

interface BuildMarkdownArgs {
  baseUrl: string;
  results: PromptResult[];
  stamp: string;
  score: EvaluationScore;
  qualityGate: EvalQualityGateResult;
}

function buildMarkdown(args: BuildMarkdownArgs): string {
  const { baseUrl, results, stamp, score, qualityGate } = args;
  const total = results.length;
  const failed = results.filter((r) => !r.ok).length;
  const ok = total - failed;
  const assertionsClean = results.filter(
    (r) => r.ok && (!r.assertions || r.assertions.length === 0),
  ).length;
  const assertionsDirty = ok - assertionsClean;
  const ttftValues = results.filter((r) => r.ttftMs !== null).map((r) => r.ttftMs as number);
  const avgTtft = ttftValues.length > 0 ? Math.round(avg(ttftValues)) : null;
  const avgTotal = total > 0 ? Math.round(avg(results.map((r) => r.totalMs))) : null;

  const lines: string[] = [];
  lines.push(`# Eval Report — ${stamp}`);
  lines.push('');
  lines.push(`- Base URL: \`${baseUrl}\``);
  lines.push(`- Prompts run: ${total}`);
  lines.push(`- Succeeded: ${ok}`);
  lines.push(`- Failed: ${failed}`);
  lines.push(`- Assertion clean: ${assertionsClean}/${ok}`);
  if (assertionsDirty > 0) {
    lines.push(`- Assertion failures: ${assertionsDirty}`);
  }
  lines.push(`- Avg TTFT: ${avgTtft === null ? 'n/a' : `${avgTtft}ms`}`);
  lines.push(`- Avg total: ${avgTotal === null ? 'n/a' : `${avgTotal}ms`}`);
  lines.push(`- Transport pass rate: ${(score.transportPassRate * 100).toFixed(1)}%`);
  lines.push(`- Assertion pass rate: ${(score.assertionPassRate * 100).toFixed(1)}%`);
  lines.push(
    `- Agent coverage: ${score.agentCoverageRate === null ? 'n/a' : `${(score.agentCoverageRate * 100).toFixed(1)}%`}`,
  );
  lines.push(`- Overall pass rate: ${(score.overallPassRate * 100).toFixed(1)}%`);
  lines.push(`- Quality gate: ${qualityGate.passed ? 'PASS' : 'FAIL'}`);
  for (const failure of qualityGate.failures) lines.push(`- Gate failure: ${failure}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r) continue;
    lines.push(`## ${i + 1}. ${r.id}${r.ok ? '' : ' — FAILED'}`);
    lines.push('');
    lines.push('**Prompt**');
    lines.push('');
    lines.push('```text');
    lines.push(r.prompt);
    lines.push('```');
    lines.push('');
    lines.push('**Timings**');
    lines.push('');
    lines.push(`- TTFT: ${r.ttftMs === null ? 'n/a' : `${r.ttftMs}ms`}`);
    lines.push(`- Total: ${r.totalMs}ms`);
    if (r.metadata.totalCostUsd !== undefined)
      lines.push(`- Reported cost: $${r.metadata.totalCostUsd.toFixed(4)}`);
    if (r.metadata.totalLatencyMs !== undefined)
      lines.push(`- Server latency: ${r.metadata.totalLatencyMs}ms`);
    if (r.metadata.ttfbMs !== undefined)
      lines.push(`- Server TTFB: ${r.metadata.ttfbMs === null ? 'n/a' : `${r.metadata.ttfbMs}ms`}`);
    if (r.citationScore !== undefined && r.citationScore !== null) {
      lines.push(`- Citation score: ${(r.citationScore * 100).toFixed(0)}%`);
    }
    lines.push('');
    if (!r.ok) {
      lines.push('**Error**');
      lines.push('');
      lines.push('```text');
      lines.push(r.error ?? '(unknown error)');
      lines.push('```');
      lines.push('');
      continue;
    }
    if (r.agentProgress.length > 0) {
      const latest = r.agentProgress[r.agentProgress.length - 1];
      lines.push(`**Agent progress** — mode: ${latest?.mode ?? 'unknown'}`);
      lines.push('');
      for (const agent of latest?.agents ?? []) lines.push(`- ${agent.agentName}: ${agent.status}`);
      lines.push('');
    }
    lines.push('**Tool calls**');
    lines.push('');
    if (r.toolCalls.length === 0) {
      lines.push('_None._');
    } else {
      for (const tc of r.toolCalls) {
        const argsSummary = summarizeJson(tc.args, 200);
        lines.push(`- \`${tc.name}\``);
        lines.push(`  - args: \`${argsSummary}\``);
        lines.push(
          `  - result: ${tc.resultSummary === null ? '_(no output)_' : `\`${tc.resultSummary}\``}`,
        );
      }
    }
    lines.push('');

    if (r.assertions && r.assertions.length > 0) {
      lines.push('**Assertion failures**');
      lines.push('');
      for (const a of r.assertions) {
        if (a.kind === 'missing_tool') lines.push(`- expected tool not called: \`${a.detail}\``);
        else if (a.kind === 'forbidden_tool')
          lines.push(`- forbidden tool was called: \`${a.detail}\``);
        else if (a.kind === 'wrong_terminal_status')
          lines.push(`- terminal status mismatch: ${a.detail}`);
        else lines.push(`- ${a.kind}: ${a.detail}`);
      }
      lines.push('');
    }
    lines.push('**Output**');
    lines.push('');
    const truncated = r.text.length > MAX_OUTPUT_CHARS;
    const shown = truncated ? `${r.text.slice(0, MAX_OUTPUT_CHARS)}…` : r.text;
    lines.push('```text');
    lines.push(shown.length > 0 ? shown : '(no text output)');
    lines.push('```');
    if (truncated) {
      lines.push('');
      lines.push(`_(output truncated at ${MAX_OUTPUT_CHARS} chars; full length ${r.text.length})_`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

export function calculateScore(results: PromptResult[]): EvaluationScore {
  const total = results.length;
  if (total === 0) {
    return {
      total: 0,
      transportPassRate: 0,
      assertionPassRate: 0,
      agentCoverageRate: null,
      overallPassRate: 0,
    };
  }
  const transportPassed = results.filter((result) => result.ok).length;
  const assertionPassed = results.filter(
    (result) => result.ok && (result.assertions?.length ?? 0) === 0,
  ).length;
  const agentCases = results.filter(
    (result) =>
      result.agentProgress.length > 0 ||
      result.assertions?.some((a) => a.kind === 'missing_agent' || a.kind === 'wrong_agent_status'),
  );
  const agentClean = agentCases.filter(
    (result) =>
      !result.assertions?.some(
        (a) => a.kind === 'missing_agent' || a.kind === 'wrong_agent_status',
      ),
  ).length;
  return {
    total,
    transportPassRate: transportPassed / total,
    assertionPassRate: assertionPassed / total,
    agentCoverageRate: agentCases.length > 0 ? agentClean / agentCases.length : null,
    overallPassRate: assertionPassed / total,
  };
}

function summarizeJson(value: unknown, max: number): string {
  let s: string;
  try {
    s = JSON.stringify(value ?? null);
  } catch {
    s = String(value);
  }
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function avg(xs: number[]): number {
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

// --- helpers ---------------------------------------------------------------

function utcStamp(d: Date): string {
  // YYYY-MM-DDTHH-MM-SSZ — colons are unsafe in some filesystems.
  const iso = d.toISOString(); // 2024-05-01T13:14:15.123Z
  return iso.replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}
