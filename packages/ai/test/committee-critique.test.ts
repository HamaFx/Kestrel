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

// Audit plan §3.2 (Q6: ON by default for full) — cross-critique round. Each
// specialist reads the other desks' verified opinions and critiques its own
// position; fusion then sees both opinions and peer reviews.

import { describe, expect, it } from 'vitest';

import { RequestContext } from '@mastra/core/request-context';

import { critiqueInstructionsForRequest, fusionInstructionsForRequest } from '../src/committee/prompts';
import { CritiqueSchema, type ModeRequestContext } from '../src/committee/types';

function contextWith(entries: Array<[string, unknown]>): RequestContext<ModeRequestContext> {
  // The context schema is z.unknown()-typed; the constructor's inferred tuple
  // type is narrower than the test fixtures, so cast at the boundary.
  return new RequestContext(entries as never) as RequestContext<ModeRequestContext>;
}

const opinions = [
  {
    agentName: 'technical' as const,
    bias: 'bullish' as const,
    confidence: 0.8,
    reasoning: 'Bullish structure; holds above the rising 50 EMA.',
    rawData: {},
    model: 'test/technical',
    providerId: 'test',
    inputTokens: 10,
    outputTokens: 5,
    costUsd: 0.001,
    latencyMs: 100,
  },
  {
    agentName: 'risk' as const,
    bias: 'bearish' as const,
    confidence: 0.6,
    reasoning: 'Invalidation sits just below current price; asymmetric downside.',
    rawData: {},
    model: 'test/risk',
    providerId: 'test',
    inputTokens: 10,
    outputTokens: 5,
    costUsd: 0.001,
    latencyMs: 100,
  },
];

const packet = {
  packetId: 'packet-1',
  kind: 'symbol_research_packet' as const,
  symbol: 'XAUUSD',
  generatedAt: '2026-10-10T12:00:00.000Z',
  status: 'ready' as const,
  dataQuality: 'complete' as const,
  price: null,
  timeframes: [],
  optionalContext: { available: false, reason: 'not configured' },
  missingData: [],
  warnings: [],
} as never;

describe('cross-critique (§3.2, Q6)', () => {
  it('builds peer-review instructions embedding the other desks, never the self', () => {
    const instructions = critiqueInstructionsForRequest({
      name: 'technical',
      peerOpinions: opinions.filter((opinion) => opinion.agentName !== 'technical'),
      requestContext: contextWith([['packet', packet]]),
    });

    expect(instructions).toContain('Kestrel\'s technical specialist');
    // Peer desks and their positions are visible for critique.
    expect(instructions).toContain('### risk');
    expect(instructions).toContain('bias: bearish');
    expect(instructions).toContain('Invalidation sits just below current price');
    // The critiquing desk's own opinion is never included as a peer.
    expect(instructions).not.toContain('### technical');
  });

  it('requests a structured critique (confirms, revisedConfidence, critique)', () => {
    const schema = CritiqueSchema;
    expect(schema.safeParse({ confirms: true, revisedConfidence: 0.7, critique: 'peers agree' }).success).toBe(true);
    expect(schema.safeParse({ confirms: true, revisedConfidence: 1.5, critique: 'x' }).success).toBe(false);
    expect(schema.safeParse({ confirms: true, revisedConfidence: 0.7 }).success).toBe(false);
  });

  it('renders peer reviews for fusion so disagreement is synthesizable', () => {
    const instructions = fusionInstructionsForRequest({
      requestContext: contextWith([
        ['packet', packet],
        ['opinions', opinions],
        [
          'critiques',
          [
            {
              agentName: 'technical' as const,
              confirms: false,
              revisedConfidence: 0.55,
              critique: 'Risk desk invalidation is close; trimming conviction.',
              model: 'test/technical',
              providerId: 'test',
              inputTokens: 8,
              outputTokens: 4,
              costUsd: 0.001,
              latencyMs: 50,
            },
          ],
        ],
      ]),
    });

    expect(instructions).toContain('SPECIALIST PEER REVIEWS');
    expect(instructions).toContain('### technical peer review');
    expect(instructions).toContain('confirms own view: false');
    expect(instructions).toContain('revised confidence: 0.55');
    expect(instructions).toContain('trimming conviction');
    // Fusion must state how specialists responded to each other.
    expect(instructions).toContain('how the specialists responded');
  });

  it('omits the peer-review block when no critiques ran (single mode)', () => {
    const instructions = fusionInstructionsForRequest({
      requestContext: contextWith([
        ['packet', packet],
        ['opinions', [opinions[0]!]],
      ]),
    });
    expect(instructions).not.toContain('SPECIALIST PEER REVIEWS');
  });
});
