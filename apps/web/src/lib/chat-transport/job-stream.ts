'use client';

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

// Background Full-analysis job → synthesized AI SDK data stream.
import { getCsrfToken } from '@/lib/auth/csrf';

import { projectCompletedJob, type PolledJobResult } from './job-result';
import { encodeChunk } from './sse-parser';
import type { AgentProgress } from './types';

export function pollJobToStreamResponse(
  jobId: string,
  abortSignal: AbortSignal | undefined,
  onProgress: (p: AgentProgress | null) => void,
): Response {
  const id = jobId;
  const MIN_POLL_MS = 2_000;
  const MAX_POLL_MS = 10_000;
  /**
   * P1-14 — overall poll cap. The previous 5-minute window hard-failed even
   * while the job was still `pending`/`running` (durable Full committee runs
   * can legitimately outlast it), contradicting the job's own terminal state.
   * Polling now continues while the status is non-terminal and only errors on
   * terminal failure states; this cap is the last-resort bound (the user's
   * stop/unmount abort cancels earlier).
   */
  const MAX_POLL_TIME_MS = 30 * 60_000;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startPoll = Date.now();
      let pollIntervalMs = MIN_POLL_MS;
      let hasError = false;
      let consecutivePollFailures = 0;
      let closed = false;

      const closeOnce = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      const cancelJob = () => {
        void fetch(`/api/chat/analysis-jobs/${jobId}`, {
          method: 'DELETE',
          headers: { 'X-CSRF-Token': getCsrfToken() ?? '' },
          keepalive: true,
        }).catch(() => {});
      };

      const abortHandler = () => {
        cancelJob();
        closeOnce();
      };
      abortSignal?.addEventListener('abort', abortHandler);
      if (abortSignal?.aborted) {
        cancelJob();
      }

      try {
        while (Date.now() - startPoll < MAX_POLL_TIME_MS) {
          if (abortSignal?.aborted) return;

          await new Promise((r) => setTimeout(r, pollIntervalMs));
          if (abortSignal?.aborted) return;

          let pollRes: Response | undefined;
          try {
            const requestInit: RequestInit = {
              headers: { 'X-CSRF-Token': getCsrfToken() ?? '' },
            };
            if (abortSignal) requestInit.signal = abortSignal;
            pollRes = await fetch(`/api/chat/analysis-jobs/${jobId}`, requestInit);
          } catch {
            // Network error — backoff and retry, but do not hide a persistent
            // transport failure behind the overall poll cap.
            consecutivePollFailures += 1;
            if (consecutivePollFailures >= 3) {
              hasError = true;
              controller.enqueue(
                encodeChunk({
                  type: 'error',
                  errorText: 'Unable to reach the background analysis worker.',
                }),
              );
              return;
            }
            pollIntervalMs = Math.min(pollIntervalMs + 2_000, MAX_POLL_MS);
            continue;
          }

          if (!pollRes?.ok) {
            consecutivePollFailures += 1;
            if (pollRes?.status === 404 || consecutivePollFailures >= 3) {
              hasError = true;
              controller.enqueue(
                encodeChunk({
                  type: 'error',
                  errorText:
                    pollRes?.status === 404
                      ? 'Background analysis job was not found.'
                      : 'Unable to poll the background analysis worker.',
                }),
              );
              return;
            }
            pollIntervalMs = Math.min(pollIntervalMs + 2_000, MAX_POLL_MS);
            continue;
          }
          consecutivePollFailures = 0;

          let pollJson: {
            status?: string;
            progress?: Array<Record<string, unknown>>;
            result?: PolledJobResult;
            error?: string;
          } = {};
          try {
            pollJson = (await pollRes.json()) as typeof pollJson;
          } catch {
            consecutivePollFailures += 1;
            if (consecutivePollFailures >= 3) {
              hasError = true;
              controller.enqueue(
                encodeChunk({
                  type: 'error',
                  errorText: 'Background analysis returned invalid status data.',
                }),
              );
              return;
            }
            pollIntervalMs = Math.min(pollIntervalMs + 2_000, MAX_POLL_MS);
            continue;
          }

          if (Array.isArray(pollJson.progress) && pollJson.progress.length > 0) {
            const last = pollJson.progress[pollJson.progress.length - 1];
            if (last && last.type === 'data-agent-progress') {
              const progress = (last as unknown as { data?: Partial<AgentProgress> }).data;
              if (progress && Array.isArray(progress.agents)) {
                onProgress(progress as AgentProgress);
                controller.enqueue(
                  encodeChunk({
                    type: 'data-agent-progress',
                    id,
                    data: progress,
                    transient: true,
                  }),
                );
              }
            }
          }

          if (pollJson.status === 'succeeded' || pollJson.status === 'complete') {
            const projection = projectCompletedJob(pollJson.result, id);
            const { finalId, finalText, completedProgress, metaData } = projection;

            if (completedProgress) {
              onProgress(completedProgress);
              controller.enqueue(
                encodeChunk({
                  type: 'data-agent-progress',
                  id: finalId,
                  data: completedProgress,
                  transient: true,
                }),
              );
            }

            controller.enqueue(encodeChunk({ type: 'text-start', id: finalId }));
            if (finalText) {
              controller.enqueue(
                encodeChunk({ type: 'text-delta', id: finalId, delta: finalText }),
              );
            }
            controller.enqueue(encodeChunk({ type: 'text-end', id: finalId }));
            controller.enqueue(
              encodeChunk({
                type: 'data-multi-agent-meta',
                id: finalId,
                data: metaData,
                transient: true,
              }),
            );
            return;
          }

          if (pollJson.status === 'failed') {
            hasError = true;
            controller.enqueue(
              encodeChunk({
                type: 'error',
                errorText:
                  pollJson.error ??
                  'Full analysis could not be completed. No partial answer was returned.',
              }),
            );
            // Keep the terminal failed-agent snapshot visible. Clearing it here
            // made the UI appear to reset immediately after showing progress.
            return;
          }

          if (pollJson.status === 'cancelled') {
            // Cancellation is a terminal, expected outcome (the user or a
            // sibling tab cancelled the job) — report it explicitly instead of
            // falling through to the unknown-status branch.
            hasError = true;
            controller.enqueue(
              encodeChunk({
                type: 'error',
                errorText: 'Full analysis was cancelled before it completed.',
              }),
            );
            onProgress(null);
            return;
          }

          if (pollJson.status !== 'pending' && pollJson.status !== 'running') {
            hasError = true;
            controller.enqueue(
              encodeChunk({
                type: 'error',
                errorText: 'Background analysis returned an unknown job status.',
              }),
            );
            onProgress(null);
            return;
          }

          pollIntervalMs = MIN_POLL_MS;
        }

        // P1-14 — reaching the cap with the job still `pending`/`running` is
        // not a job failure: the worker may simply be busy. Say so instead
        // of claiming a definitive timeout.
        if (!hasError) {
          controller.enqueue(
            encodeChunk({
              type: 'error',
              errorText:
                'Background analysis is still running after 30 minutes of waiting. Stop waiting and check back, or start a fresh analysis.',
            }),
          );
        }
      } finally {
        abortSignal?.removeEventListener('abort', abortHandler);
        closeOnce();
      }
    },
  });

  return new Response(stream, { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}

/**
 * Synthesize an AI SDK data stream for a mutation draft: an assistant
 * message whose only part is the confirmation card (`data-mutation-
 * confirmation`). The card owns the confirm/resume round-trip, so the
 * stream carries no text.
 */
