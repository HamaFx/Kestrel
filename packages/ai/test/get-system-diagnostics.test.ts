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

/* eslint-disable @typescript-eslint/no-explicit-any */
import { GetSystemDiagnosticsOutputSchema, type GetSystemDiagnosticsOutput } from '@kestrel/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractNumbersFromToolOutput } from '../src/committee/grounding';
import { createToolContext, withToolContext } from '../src/runtime/tool-context';
import { getSystemDiagnosticsTool } from '../src/tools/get-system-diagnostics';

process.env['FRED_API_KEY'] = 'test-fred-key';
process.env['GOOGLE_GENERATIVE_AI_API_KEY'] = 'test-ai-key';

const mocks = vi.hoisted(() => ({ failProbe: false }));

vi.mock('@kestrel/db', () => {
  const schema = {
    journalEntries: { id: 'journal_entries', userId: 'je.user_id', tenantId: 'je.tenant_id' },
    snapshots: {
      id: 'snapshots',
      symbol: 'snapshots.symbol',
      kind: 'snapshots.kind',
      asOf: 'snapshots.as_of',
    },
    briefingsEmitted: {
      id: 'briefings_emitted',
      tenantId: 'be.tenant_id',
      createdAt: 'be.created_at',
    },
    intermarketResonance: { id: 'intermarket_resonance', date: 'ir.date' },
    cotReports: { reportDate: 'cot.report_date' },
    memoryEmbeddings: { id: 'memory_embeddings', userId: 'me.user_id', tenantId: 'me.tenant_id' },
    alerts: { userId: 'alerts.user_id', tenantId: 'alerts.tenant_id', active: 'alerts.active' },
  };

  const counts: Array<[unknown, number]> = [
    [schema.journalEntries, 42],
    [schema.snapshots, 89],
    [schema.briefingsEmitted, 12],
    [schema.intermarketResonance, 34],
    [schema.memoryEmbeddings, 67],
    [schema.alerts, 3],
  ];
  const recent: Array<[unknown, unknown[]]> = [
    [schema.intermarketResonance, [{ date: '2026-05-28' }]],
    [schema.cotReports, [{ reportDate: new Date('2026-05-26T00:00:00Z') }]],
  ];

  return {
    hasAdminDbScope: () => false,
    hasTenantDbScope: () => false,
    requireTenantIdForUser: vi.fn().mockResolvedValue('test-tenant'),
    getDb: () => ({
      select: () => {
        if (mocks.failProbe) throw new Error('db probe failed');
        return {
          from: (table: unknown) => {
            const count = counts.find(([t]) => t === table)?.[1] ?? 0;
            const rows = recent.find(([t]) => t === table)?.[1] ?? [];
            const chain: Record<string, unknown> = {
              where: () => chain,
              orderBy: () => ({ limit: async () => rows }),
              limit: async () => rows,
              then: (
                onFulfilled: ((value: unknown) => unknown) | null,
                onRejected?: ((reason: unknown) => unknown) | null,
              ) => Promise.resolve([{ count }]).then(onFulfilled, onRejected),
            };
            return chain;
          },
        };
      },
    }),
    schema,
  };
});

async function runDiagnostics(): Promise<GetSystemDiagnosticsOutput> {
  return (await withToolContext(
    createToolContext({
      threadId: 'test-thread-id',
      userId: 'test-user',
      latestUserMessageText: 'Show me system diagnostics.',
      budget: { spent: 0.15, max: 10.0 },
    }),
    () =>
      Promise.resolve(
        getSystemDiagnosticsTool.execute!({ verbose: true, forceProbe: false }, {} as any),
      ),
  )) as GetSystemDiagnosticsOutput;
}

describe('Diagnostics Tools', () => {
  beforeEach(() => {
    mocks.failProbe = false;
  });

  it('correctly reports system diagnostics stats', async () => {
    const result = await runDiagnostics();

    expect(result.status).toBe('healthy');
    expect(result.budget.spentUsd).toBe(0.15);
    expect(result.budget.limitUsd).toBe(10.0);
    expect(result.budget.remainingUsd).toBe(9.85);
    expect(result.database.status).toBe('connected');
    expect(result.narrative).toContain('HEALTHY');
    // Counts are real measurements, including the active alert count that
    // used to be a hard-coded 0 placeholder (R8).
    expect(result.database.journalEntriesCount).toBe(42);
    expect(result.database.memoryEmbeddingsCount).toBe(67);
    expect(result.worker.activeAlertsCount).toBe(3);
    // The COT freshness reading now comes from `cot_reports`, not the
    // briefings table (found while fixing R8).
    expect(result.worker.resonanceSyncLastRun).toBe('2026-05-28');
    expect(result.worker.cotSyncLastRun).toBe('2026-05-26');
    expect(GetSystemDiagnosticsOutputSchema.safeParse(result).success).toBe(true);
  });

  it('reports nulls, not zeros, when the count probe fails', async () => {
    mocks.failProbe = true;

    const result = await runDiagnostics();

    // A failed database probe is 'unhealthy', not merely 'degraded' — the
    // old status expression made 'unhealthy' unreachable (R8 follow-up).
    expect(result.status).toBe('unhealthy');
    expect(result.database.status).toBe('error');
    expect(result.database.latencyMs).toBeNull();
    expect(result.database.journalEntriesCount).toBeNull();
    expect(result.database.snapshotsCount).toBeNull();
    expect(result.database.briefingsCount).toBeNull();
    expect(result.database.resonanceCount).toBeNull();
    expect(result.database.memoryEmbeddingsCount).toBeNull();
    expect(result.worker.activeAlertsCount).toBeNull();
    expect(result.narrative).toMatch(/unhealthy/i);
    expect(result.narrative).toMatch(/database probe failed/i);
    expect(result.narrative).toMatch(/unavailable/i);
    expect(result.narrative).not.toMatch(/0 journals/);

    // No exact 0 can ground an "empty database" claim after a failed probe.
    const evidence = extractNumbersFromToolOutput({
      latencyMs: result.database.latencyMs,
      journalEntriesCount: result.database.journalEntriesCount,
      snapshotsCount: result.database.snapshotsCount,
      activeAlertsCount: result.worker.activeAlertsCount,
    });
    expect(evidence).not.toContain(0);
    expect(GetSystemDiagnosticsOutputSchema.safeParse(result).success).toBe(true);
  });

  it('reports degraded (not unhealthy) when the database works but a key is missing', async () => {
    const saved = process.env['GOOGLE_GENERATIVE_AI_API_KEY'];
    delete process.env['GOOGLE_GENERATIVE_AI_API_KEY'];
    try {
      const result = await runDiagnostics();

      expect(result.database.status).toBe('connected');
      expect(result.status).toBe('degraded');
      expect(result.narrative).toContain('DEGRADED');
      expect(result.narrative).toMatch(/latency budget/i);
      expect(GetSystemDiagnosticsOutputSchema.safeParse(result).success).toBe(true);
    } finally {
      if (saved !== undefined) process.env['GOOGLE_GENERATIVE_AI_API_KEY'] = saved;
    }
  });

  it('keeps parsing a previously persisted probe output that used -1 for offline', () => {
    const legacy = {
      status: 'degraded',
      asOf: new Date().toISOString(),
      database: {
        status: 'error',
        latencyMs: -1,
        journalEntriesCount: 0,
        snapshotsCount: 0,
        briefingsCount: 0,
        resonanceCount: 0,
        memoryEmbeddingsCount: 0,
      },
      worker: {
        resonanceSyncLastRun: null,
        cotSyncLastRun: null,
        activeAlertsCount: 0,
      },
      budget: { spentUsd: 0, limitUsd: 10, remainingUsd: 10 },
      envCheck: {},
      narrative: 'System status is DEGRADED.',
    };
    expect(GetSystemDiagnosticsOutputSchema.safeParse(legacy).success).toBe(true);
  });
});
