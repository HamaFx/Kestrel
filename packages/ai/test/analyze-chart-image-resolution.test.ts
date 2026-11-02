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

// Audit 2026-10-31 (R7 follow-up) — the chart-analysis tool passes the stored
// image reference to the vision model; the provider-boundary middleware turns
// it into bytes at the model call. Handing over a `data:` URL here would
// duplicate the bytes into any transcript that records the call.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withToolContext, type ToolContext } from '../src/runtime/tool-context';
import { analyzeChartImageTool } from '../src/tools/analyze-chart-image';

const mocks = vi.hoisted(() => ({
  runMastraText: vi.fn(),
  resolveVisionModel: vi.fn(),
  requireTenantIdForUser: vi.fn(async () => 'tenant-1'),
}));

vi.mock('@kestrel/db', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@kestrel/db');
  return { ...actual, requireTenantIdForUser: mocks.requireTenantIdForUser };
});

vi.mock('../src/mastra-v2/shared/text-runner', () => ({
  runMastraText: mocks.runMastraText,
}));

vi.mock('../src/models/model', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../src/models/model');
  return { ...actual, resolveVisionModel: mocks.resolveVisionModel };
});

const STORAGE_PATH = 'user-1/2026-11-01/ab12cd34ef56-chart.png';
const PROXY_URL = `https://app.example.com/api/uploads/${STORAGE_PATH}`;
const LEGACY_URL = `https://project.supabase.co/storage/v1/object/public/chat-images/${STORAGE_PATH}`;

const exec = analyzeChartImageTool.execute as unknown as (
  input: Record<string, never>,
  options?: { abortSignal?: AbortSignal },
) => Promise<unknown>;

function dbWith(rows: Array<{ parts: unknown }>) {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => Promise.resolve(rows),
            }),
          }),
        }),
      }),
    }),
  };
}

function contextWith(rows: Array<{ parts: unknown }>): ToolContext {
  return {
    threadId: 'thread-1',
    userId: 'user-1',
    env: { LOG_PROMPTS: false },
    signal: null,
    budget: { spent: 0, max: 10 },
    userSettings: {},
    db: dbWith(rows),
  } as unknown as ToolContext;
}

function capturedMessages(): unknown {
  return mocks.runMastraText.mock.calls[0]![0].messages;
}

function expectNoInlineImages(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain('data:image');
  expect(serialized).not.toMatch(/;\s*base64,/);
}

describe('analyze_chart_image keeps the image reference (R7 follow-up)', () => {
  beforeEach(() => {
    mocks.runMastraText.mockReset();
    mocks.resolveVisionModel.mockReset();
    mocks.resolveVisionModel.mockReturnValue({
      model: {},
      modelId: 'google/gemini-2.5-flash',
      providerId: 'google',
      bareModelId: 'gemini-2.5-flash',
    });
    mocks.runMastraText.mockResolvedValue({
      text: 'A bullish chart.',
      inputTokens: 5,
      outputTokens: 3,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes the stored proxy reference to the vision call', async () => {
    const rows = [{ parts: [{ type: 'file', url: PROXY_URL, mediaType: 'image/png' }] }];

    await withToolContext(contextWith(rows), () => exec({}));

    const messages = capturedMessages() as Array<{ content: unknown[] }>;
    expect(messages[0]!.content).toContainEqual({
      type: 'file',
      data: PROXY_URL,
      mediaType: 'image',
    });
    expectNoInlineImages(messages);
  });

  it('passes a legacy public URL through untouched', async () => {
    const rows = [{ parts: [{ type: 'file', url: LEGACY_URL, mediaType: 'image/png' }] }];

    await withToolContext(contextWith(rows), () => exec({}));

    expect(JSON.stringify(capturedMessages())).toContain(LEGACY_URL);
    expectNoInlineImages(capturedMessages());
  });

  it('does not call the vision model when no image is attached', async () => {
    const rows = [{ parts: [{ type: 'text', text: 'no image here' }] }];

    const result = await withToolContext(contextWith(rows), () => exec({}));

    expect(mocks.runMastraText).not.toHaveBeenCalled();
    expect(result).toMatchObject({ observed: 'no image attached' });
  });
});
