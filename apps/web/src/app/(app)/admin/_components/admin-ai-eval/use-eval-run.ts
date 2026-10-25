// SPDX-License-Identifier: Apache-2.0

// Run-loop state for the AI eval sweep: row statuses, the stop flag, and the
// completed/failed summary line.
import { useCallback, useRef, useState } from 'react';

import { AI_EVAL_PROMPTS } from '@/lib/services/ai-eval-prompts';

import {
  BETWEEN_PROMPTS_DELAY_MS,
  createThread,
  delay,
  isRateLimit,
  MAX_RATE_LIMIT_RETRIES,
  RATE_LIMIT_RETRY_DELAY_MS,
  runOnePrompt,
  type EvalRow,
  type RunOneResult,
} from './eval-runner';

function pendingRows(): EvalRow[] {
  return AI_EVAL_PROMPTS.map((p) => ({ id: p.id, prompt: p.prompt, status: 'pending' as const }));
}

export function useEvalRun() {
  const [rows, setRows] = useState<EvalRow[]>(pendingRows);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const stopRef = useRef(false);

  const patchRow = useCallback((index: number, patch: Partial<EvalRow>) => {
    setRows((prev) => {
      const next = prev.slice();
      const current = next[index];
      if (current) next[index] = { ...current, ...patch };
      return next;
    });
  }, []);

  const run = useCallback(async () => {
    stopRef.current = false;
    setRunning(true);
    setSummary(null);
    setRows(pendingRows());

    let ok = 0;
    let failed = 0;
    const failures: string[] = [];

    for (let index = 0; index < AI_EVAL_PROMPTS.length; index += 1) {
      const prompt = AI_EVAL_PROMPTS[index];
      if (!prompt) break;
      if (stopRef.current) {
        setSummary(`Stopped at prompt ${index + 1}/${AI_EVAL_PROMPTS.length}`);
        setRunning(false);
        return;
      }

      patchRow(index, { status: 'running' });
      try {
        // Free-tier provider keys (e.g. Mistral) trip their rate limits when
        // 30 multi-call prompts run back-to-back. Retry rate-limited prompts
        // with a backoff so the run survives instead of failing row by row.
        // Each attempt gets a fresh thread so a partially-persisted first
        // attempt can never duplicate the user message.
        let result: RunOneResult | null = null;
        for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
          if (stopRef.current) break;
          const threadId = await createThread();
          const attemptResult = await runOnePrompt(threadId, prompt.prompt);
          if (!isRateLimit(attemptResult) || attempt >= MAX_RATE_LIMIT_RETRIES) {
            result = attemptResult;
            break;
          }
          patchRow(index, {
            error: `Rate limited — retrying in ${RATE_LIMIT_RETRY_DELAY_MS / 1000}s (attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})…`,
          });
          await delay(RATE_LIMIT_RETRY_DELAY_MS * (attempt + 1));
        }
        if (!result) {
          result = { ok: false, totalMs: 0, text: '', error: 'Run stopped before completion' };
        }
        if (result.ok) {
          ok += 1;
          patchRow(index, { status: 'ok', totalMs: result.totalMs, chars: result.text.length });
        } else {
          failed += 1;
          failures.push(`${prompt.id}: ${result.error ?? 'failed'}`);
          patchRow(index, { status: 'failed', totalMs: result.totalMs, error: result.error });
        }
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${prompt.id}: ${message}`);
        patchRow(index, { status: 'failed', error: message });
      }

      if (index < AI_EVAL_PROMPTS.length - 1 && !stopRef.current) {
        await delay(BETWEEN_PROMPTS_DELAY_MS);
      }
    }

    setRunning(false);
    setSummary(
      failures.length > 0
        ? `Done: ${ok} ok, ${failed} failed. Failures: ${failures.join('; ')}`
        : `Done: all ${ok} prompts completed successfully.`,
    );
  }, [patchRow]);

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  const reset = useCallback(() => {
    setRows(pendingRows());
  }, []);

  const completed = rows.filter((r) => r.status === 'ok' || r.status === 'failed').length;

  return { rows, running, summary, completed, run, stop, reset };
}
