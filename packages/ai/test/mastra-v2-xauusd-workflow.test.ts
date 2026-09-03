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

import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RequestContext } from '@mastra/core/request-context';
import { LibSQLStore } from '@mastra/libsql';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createKestrelMastra, initializeKestrelMastra } from '../src/mastra-v2';
import {
  createXauusdReportWorkflow,
  resolveXauusdReportOutputPolicy,
} from '../src/mastra-v2/workflows/xauusd-report';
import { XauusdResearchReportSchema } from '../src/mastra/report-types';
import { XauusdResearchPacketSchema } from '../src/mastra/research-types';

const mocks = vi.hoisted(() => ({
  collectXauusdResearchPacket: vi.fn(),
  requireVerifiedXauusdReport: vi.fn(),
}));

vi.mock('../src/mastra/research-packet', () => ({
  collectXauusdResearchPacket: mocks.collectXauusdResearchPacket,
}));
vi.mock('../src/mastra/report-verifier', () => ({
  requireVerifiedXauusdReport: mocks.requireVerifiedXauusdReport,
  XauusdReportVerificationError: class extends Error {
    readonly findings: readonly string[];

    constructor(findings: readonly string[]) {
      super('XAUUSD report failed deterministic verification');
      this.name = 'XauusdReportVerificationError';
      this.findings = findings;
    }
  },
}));

const blockedPacket = XauusdResearchPacketSchema.parse({
  packetId: 'packet-blocked',
  kind: 'research_packet',
  symbol: 'XAUUSD',
  generatedAt: new Date().toISOString(),
  status: 'blocked',
  dataQuality: 'degraded',
  timeframes: ['1d', '4h', '1h', '15m'],
  price: null,
  candles: [],
  indicators: [],
  macro: null,
  missingData: ['Current XAUUSD price is unavailable.'],
  warnings: [],
});

const readyPacket = XauusdResearchPacketSchema.parse({
  packetId: 'packet-1',
  kind: 'research_packet',
  symbol: 'XAUUSD',
  generatedAt: new Date().toISOString(),
  status: 'ready',
  dataQuality: 'complete',
  timeframes: ['1d', '4h', '1h', '15m'],
  price: null,
  candles: [],
  indicators: [],
  macro: null,
  missingData: [],
  warnings: [],
});

const report = {
  symbol: 'XAUUSD',
  asOf: new Date().toISOString(),
  dataQuality: 'complete',
  bias: 'neutral',
  confidence: 0.5,
  regime: 'range',
  bottomLine: 'Test report',
  technicalSummary: 'Test technical summary',
  fundamentalSummary: 'Unavailable',
  scenarios: [
    {
      name: 'Bullish',
      direction: 'bullish',
      trigger: 'breakout',
      invalidation: 'below level',
      targets: [],
      risks: ['volatility'],
      evidenceIds: ['packet-1'],
    },
    {
      name: 'Bearish',
      direction: 'bearish',
      trigger: 'breakdown',
      invalidation: 'above level',
      targets: [],
      risks: ['volatility'],
      evidenceIds: ['packet-1'],
    },
  ],
  contradictions: [],
  missingData: [],
  numericClaims: [{ label: 'Test claim', value: 1, evidenceId: 'packet-1' }],
  evidenceIds: ['packet-1'],
  sources: [{ evidenceId: 'packet-1', source: 'fixture', dataAsOf: new Date().toISOString() }],
};

function contextFor(runId: string) {
  return new RequestContext([
    ['userId', 'user-1'],
    ['runId', runId],
    ['threadId', 'thread-1'],
  ]) as never;
}

type RunResult = { status: string; result?: unknown; error?: { message?: string } };

async function startWorkflow(
  workflow: ReturnType<typeof createXauusdReportWorkflow>,
  runId: string,
  prompt: string,
): Promise<RunResult> {
  const run = await workflow.createRun({ runId });
  return (await run.start({
    inputData: { prompt },
    requestContext: contextFor(runId),
  })) as unknown as RunResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.collectXauusdResearchPacket.mockReset().mockResolvedValue(readyPacket);
  mocks.requireVerifiedXauusdReport.mockReset().mockReturnValue(report);
});

describe('xauusd-report workflow', () => {
  it('fails closed with a graceful blocked output when the packet is blocked', async () => {
    mocks.collectXauusdResearchPacket.mockResolvedValue(blockedPacket);
    const generate = vi.fn();

    const workflow = createXauusdReportWorkflow({
      agent: { generate } as never,
      callOptions: {} as never,
      providerId: 'mistral',
    });
    const result = await startWorkflow(workflow, 'xau-blocked', 'Analyse gold');

    expect(result.status).toBe('success');
    const output = result.result as {
      status: string;
      blockedText: string;
      stats: { inputTokens: number };
    };
    expect(output.status).toBe('blocked');
    expect(output.blockedText).toContain('XAUUSD');
    expect(generate).not.toHaveBeenCalled();
    expect(output.stats.inputTokens).toBe(0);
  });

  it('defaults the output policy to verified (strong verifier + repair loop)', () => {
    expect(resolveXauusdReportOutputPolicy(undefined)).toBe('verified');
    expect(resolveXauusdReportOutputPolicy('verified')).toBe('verified');
    expect(resolveXauusdReportOutputPolicy('schema')).toBe('schema');
  });

  it('accepts schema-valid structured output without the deterministic verifier under the schema policy', async () => {
    // Under the `schema` output policy the deterministic report verifier is
    // never consulted: any schema-valid structured output is accepted
    // directly (used by generic research composition, Phase 7).
    const generate = vi.fn().mockResolvedValue({
      object: XauusdResearchReportSchema.parse(report),
      text: 'schema-mode report',
      usage: { inputTokens: 6, outputTokens: 4 },
    });

    const workflow = createXauusdReportWorkflow({
      agent: { generate } as never,
      callOptions: {} as never,
      providerId: 'mistral',
      outputPolicy: 'schema',
    });
    const result = await startWorkflow(workflow, 'xau-schema', 'Analyse gold');

    expect(result.status).toBe('success');
    const output = result.result as { status: string; attempts: number };
    expect(output.status).toBe('ready');
    expect(output.attempts).toBe(1);
    expect(mocks.requireVerifiedXauusdReport).not.toHaveBeenCalled();
  });

  it('routes malformed structured output into the repair loop under the schema policy', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        object: { bottomLine: 'missing every other field' },
        text: 'bad',
        usage: { inputTokens: 1, outputTokens: 1 },
      })
      .mockResolvedValueOnce({
        object: XauusdResearchReportSchema.parse(report),
        text: 'repaired',
        usage: { inputTokens: 1, outputTokens: 1 },
      });

    const workflow = createXauusdReportWorkflow({
      agent: { generate } as never,
      callOptions: {} as never,
      providerId: 'mistral',
      outputPolicy: 'schema',
    });
    const result = await startWorkflow(workflow, 'xau-schema-repair', 'Analyse gold');

    expect(result.status).toBe('success');
    const output = result.result as { status: string; attempts: number };
    expect(output.status).toBe('ready');
    expect(output.attempts).toBe(2);
    expect(mocks.requireVerifiedXauusdReport).not.toHaveBeenCalled();
  });

  it('persists run snapshots including the repair attempt when an instance is provided', async () => {
    const file = join(
      tmpdir(),
      `kestrel-xau-snap-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    const url = `file:${file}`;
    try {
      const store = new LibSQLStore({ id: 'test-store', url });
      const mastra = createKestrelMastra({ storage: store, storageKind: 'libsql', env: {} });
      await initializeKestrelMastra(mastra);

      // First generation fails verification, the repair step fixes it. The
      // thrown verification error must carry findings (like the real verifier).
      mocks.requireVerifiedXauusdReport
        .mockImplementationOnce(() => {
          throw Object.assign(new Error('verification failed'), {
            findings: ['missing contradiction disclosure'],
          });
        })
        .mockReturnValue(report);
      const generate = vi
        .fn()
        .mockResolvedValueOnce({
          object: { invalid: true },
          text: 'first',
          usage: { inputTokens: 5, outputTokens: 3 },
        })
        .mockResolvedValueOnce({
          object: { valid: true },
          text: 'second',
          usage: { inputTokens: 5, outputTokens: 3 },
        });

      const workflow = createXauusdReportWorkflow({
        agent: { generate } as never,
        callOptions: {} as never,
        providerId: 'mistral',
        mastra: mastra.instance,
      });
      const result = await startWorkflow(workflow, 'xau-snap', 'Analyse gold');

      expect(result.status).toBe('success');
      const output = result.result as { status: string; attempts: number };
      expect(output.status).toBe('ready');
      expect(output.attempts).toBe(2);

      const state = await workflow.getWorkflowRunById('xau-snap');
      expect(state).not.toBeNull();
      expect((state as { workflowName?: string } | null)?.workflowName).toBe('xauusd-research');
      expect(state?.status).toBe('success');
      expect(Object.keys(state?.steps ?? {})).toEqual(
        expect.arrayContaining(['collect-packet', 'generate', 'repair', 'finalize']),
      );
    } finally {
      rmSync(file, { force: true });
    }
  });
});
