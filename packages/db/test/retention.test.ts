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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRetentionConfigFromEnv, runRetentionCleanup, runVacuumAnalyze } from '../src/retention';

const execute = vi.fn();

vi.mock('../src/client', () => ({
  getDb: vi.fn(() => ({ execute })),
}));

describe('retention cleanup', () => {
  beforeEach(() => {
    execute.mockReset();
    execute.mockResolvedValue({ count: 2 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses safe defaults and rejects unsafe environment windows', () => {
    vi.stubEnv('TELEMETRY_RETENTION_DAYS', '-1');
    vi.stubEnv('TRACE_RETENTION_DAYS', '99999');
    vi.stubEnv('RATE_LIMIT_RETENTION_HOURS', '0');
    vi.stubEnv('BILLING_WEBHOOK_DLQ_RETENTION_DAYS', '-1');
    vi.stubEnv('AI_EVALUATION_RETENTION_DAYS', '-1');
    vi.stubEnv('OBSERVATIONAL_MEMORY_RETENTION_DAYS', '-1');

    expect(getRetentionConfigFromEnv()).toMatchObject({
      telemetryRetentionDays: 90,
      traceRetentionDays: 30,
      rateLimitRetentionHours: 2,
      billingWebhookDlqRetentionDays: 90,
      aiEvaluationRetentionDays: 90,
      observationalMemoryRetentionDays: 90,
    });
  });

  it('cleans all operational and recovery tables with one bounded batch each', async () => {
    const result = await runRetentionCleanup({
      telemetryRetentionDays: 1,
      traceRetentionDays: 1,
      rateLimitRetentionHours: 1,
      providerDailyQuotaRetentionDays: 1,
      cronRunRetentionDays: 1,
      outboxRetentionDays: 1,
      analysisJobRetentionDays: 1,
      billingWebhookDlqRetentionDays: 1,
      aiEvaluationRetentionDays: 1,
      budgetReservationRetentionDays: 1,
      observationalMemoryRetentionDays: 1,
    });

    // 17 batched deletes + the observational-memory existence check (the
    // mocked driver result has no rows, so the delete is skipped).
    expect(execute).toHaveBeenCalledTimes(18);
    expect(result).toMatchObject({
      telemetryDeleted: 2,
      toolTelemetryDeleted: 2,
      tracesDeleted: 2,
      rateLimitsDeleted: 2,
      providerDailyQuotaDeleted: 2,
      cronRunsDeleted: 2,
      outboxDeleted: 2,
      fullAnalysisQueueDeleted: 2,
      billingWebhookDlqDeleted: 2,
      aiShadowComparisonsDeleted: 2,
      aiQualityResultsDeleted: 2,
      budgetReservationsDeleted: 2,
      telegramUpdatesDeleted: 2,
      sharedSnapshotsDeleted: 2,
      notificationNoiseStateDeleted: 2,
      mastraObservationalMemoryDeleted: 0,
      creditLedgerDeleted: 2,
      billingEventsDeleted: 2,
    });
    expect(result.note).toContain('fullAnalysisQueueDeleted=2');
    expect(result.note).toContain('billingWebhookDlqDeleted=2');
    expect(result.note).toContain('aiShadowComparisonsDeleted=2');
    expect(result.note).toContain('aiQualityResultsDeleted=2');
  });

  it('does not issue a second batch when the first batch is full', async () => {
    execute.mockResolvedValue({ count: 1_000 });

    await runRetentionCleanup({ telemetryRetentionDays: 1 });

    expect(execute).toHaveBeenCalledTimes(18);
  });

  it('prunes dormant Mastra observational-memory rows when the table exists (audit v2 §4.4)', async () => {
    // The existence probe is a parameterized SELECT on information_schema;
    // the deletes are raw statements. Drizzle wraps literal SQL text in
    // StringChunk objects, so flatten each query's chunks for matching.
    const statementText = (query: unknown): string => {
      const chunks = (query as { queryChunks?: unknown[] })?.queryChunks ?? [];
      return chunks
        .map((chunk) => {
          if (typeof chunk === 'string') return chunk;
          const value = (chunk as { value?: unknown })?.value;
          if (typeof value === 'string') return value;
          if (Array.isArray(value)) return value.join('');
          return '';
        })
        .join('');
    };
    const OM_DELETE = 'DELETE FROM "mastra"."mastra_observational_memory"';
    execute.mockImplementation(async (query: unknown) =>
      statementText(query).includes('information_schema.tables')
        ? [{ exists: true }]
        : { count: 2 },
    );

    const result = await runRetentionCleanup({ observationalMemoryRetentionDays: 30 });

    expect(result.mastraObservationalMemoryDeleted).toBe(2);
    expect(result.note).toContain('mastraObservationalMemoryDeleted=2');

    const omStatement = execute.mock.calls
      .map(([query]) => statementText(query))
      .find((text) => text.includes(OM_DELETE));
    // Schema-qualified (Mastra runtime schema), anchored on the last write,
    // and bounded to one batch — following the module's existing pattern.
    expect(omStatement).toBeDefined();
    expect(omStatement).toContain('"updatedAt" <');
    expect(omStatement).toContain('LIMIT 1000');
  });

  it('skips the Mastra observational-memory cleanup when the table is absent', async () => {
    const statementText = (query: unknown): string => {
      const chunks = (query as { queryChunks?: unknown[] })?.queryChunks ?? [];
      return chunks
        .map((chunk) => {
          if (typeof chunk === 'string') return chunk;
          const value = (chunk as { value?: unknown })?.value;
          if (typeof value === 'string') return value;
          if (Array.isArray(value)) return value.join('');
          return '';
        })
        .join('');
    };
    execute.mockImplementation(async (query: unknown) =>
      statementText(query).includes('information_schema.tables')
        ? [{ exists: false }]
        : { count: 2 },
    );

    const result = await runRetentionCleanup({ observationalMemoryRetentionDays: 30 });

    expect(result.mastraObservationalMemoryDeleted).toBe(0);
    expect(
      execute.mock.calls
        .map(([query]) => statementText(query))
        .some((text) => text.includes('mastra_observational_memory') && text.includes('DELETE')),
    ).toBe(false);
  });

  it('vacuum analyzes only the bounded operational table list', async () => {
    await runVacuumAnalyze();

    expect(execute).toHaveBeenCalledTimes(8);
  });
});
