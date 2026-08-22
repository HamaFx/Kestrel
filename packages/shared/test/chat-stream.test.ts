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

// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { AnalysisQueuedEventSchema, ChatStreamEventSchema } from '../src/schemas/chat-stream';

describe('ChatStreamEventSchema', () => {
  it('parses a text-start event', () => {
    const result = ChatStreamEventSchema.safeParse({ type: 'text-start', id: 'msg-1' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.type).toBe('text-start');
    if (result.data.type === 'text-start') {
      expect(result.data.id).toBe('msg-1');
    }
  });

  it('parses a text-delta event', () => {
    const result = ChatStreamEventSchema.safeParse({
      type: 'text-delta',
      id: 'msg-1',
      delta: 'hello',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.type).toBe('text-delta');
    if (result.data.type === 'text-delta') {
      expect(result.data.delta).toBe('hello');
    }
  });

  it('parses a data-agent-progress event without an id', () => {
    const result = ChatStreamEventSchema.safeParse({
      type: 'data-agent-progress',
      data: { agents: [{ agentName: 'technical', status: 'running' }], mode: 'quick' },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.type).toBe('data-agent-progress');
  });

  it('rejects unknown event types', () => {
    const result = ChatStreamEventSchema.safeParse({ type: 'unknown', id: 'x' });
    expect(result.success).toBe(false);
  });
});

describe('AnalysisQueuedEventSchema', () => {
  it('parses the analysis-queued envelope', () => {
    const result = AnalysisQueuedEventSchema.safeParse({
      type: 'analysis-queued',
      jobId: 'job-123',
      status: 'queued',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.jobId).toBe('job-123');
  });
});
