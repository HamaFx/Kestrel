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

// ---------------------------------------------------------------------------
// Composable Playwright fixtures — 2026 upgrade
//
// Replaces manual login boilerplate in every spec with a reusable `authedPage`
// fixture that loads a pre-authenticated storageState. Also provides:
//   • `mockChatApi` — intercepts /api/chat with a configurable mock response
//   • `testUser` — worker-isolated test user credentials
//   • `workerUser` — worker-scoped authenticated user record
//
// Usage:
//   import { test, expect } from './fixtures';
//   test('my test', async ({ authedPage }) => { ... });
// ---------------------------------------------------------------------------

import { createThread, deleteThread } from '@kestrel/ai/persistence';
import { test as base, expect, type Page } from '@playwright/test';

import { createSessionForUser, ensureTestUser, workerUserEmail } from './test-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkerUserFixture {
  id: string;
  email: string;
  password: string;
  cookie: Awaited<ReturnType<typeof createSessionForUser>>;
}

export interface ChatMockOptions {
  /** SSE body for multi-agent mode (analysisMode !== 'single') */
  multiAgentBody?: string;
  /** Body for single-agent mode */
  singleAgentBody?: string;
  /** HTTP status (default 200) */
  status?: number;
}

export interface Fixtures {
  /** A page that is already logged in via storageState */
  authedPage: Page;
  /** Helper to mock the /api/chat endpoint */
  mockChatApi: (page: Page, opts?: ChatMockOptions) => Promise<void>;
  /** Default test user credentials (isolated per worker) */
  testUser: { email: string; password: string };
}

// ---------------------------------------------------------------------------
// Default test user
// ---------------------------------------------------------------------------

export const DEFAULT_USER = {
  email: 'test@example.com',
  password: 'password123',
} as const;

// ---------------------------------------------------------------------------
// Mock chat API helper
// ---------------------------------------------------------------------------

async function mockChatApi(page: Page, opts: ChatMockOptions = {}) {
  const { status = 200, singleAgentBody = '0:"Mock AI response"\n', multiAgentBody } = opts;

  // Match only the exact chat endpoint. A broader `**/api/chat` glob also
  // intercepts `/api/chat/threads/fork` (and other sub-routes), which would
  // swallow the fork request and return a chat stream instead of the fork
  // JSON response.
  await page.route(/\/api\/chat(?:\?.*)?$/, (route) => {
    let body: { analysisMode?: string } | undefined;
    try {
      body = route.request().postDataJSON() as { analysisMode?: string };
    } catch {
      // A malformed request is still given the deterministic mock response;
      // the UI test is validating rendering, not request serialization.
    }
    const isMultiAgent = body?.analysisMode && body.analysisMode !== 'single';

    if (isMultiAgent && multiAgentBody) {
      route.fulfill({
        status,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
        body: multiAgentBody,
      });
    } else {
      const text = extractMockText(singleAgentBody);
      route.fulfill({
        status,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
        body: [
          `data: ${JSON.stringify({ type: 'text-start', id: TEST_MESSAGE_ID })}`,
          '',
          `data: ${JSON.stringify({ type: 'text-delta', id: TEST_MESSAGE_ID, delta: text })}`,
          '',
          `data: ${JSON.stringify({ type: 'text-end', id: TEST_MESSAGE_ID })}`,
          '',
        ].join('\n'),
      });
    }
  });
}

function extractMockText(dataStream: string): string {
  const firstTextPart = dataStream.match(/^0:(.*)$/m)?.[1]?.trim();
  if (!firstTextPart) return dataStream;
  try {
    return JSON.parse(firstTextPart) as string;
  } catch {
    return dataStream;
  }
}

// ---------------------------------------------------------------------------
// Multi-agent SSE mock bodies — current ChatStreamEventSchema protocol.
// ---------------------------------------------------------------------------

const TEST_MESSAGE_ID = crypto.randomUUID();

export const FULL_MODE_SSE = [
  'data: {"type":"data-agent-progress","data":{"agents":[{"agentName":"technical","status":"running"},{"agentName":"fundamental","status":"pending"},{"agentName":"risk","status":"pending"},{"agentName":"sentiment","status":"pending"},{"agentName":"decision","status":"pending"}],"mode":"full"}}',
  '',
  'data: {"type":"data-agent-progress","data":{"agents":[{"agentName":"technical","status":"done","opinion":{"agentName":"technical","bias":"bullish","confidence":0.8,"reasoning":"Uptrend"}},{"agentName":"fundamental","status":"done","opinion":{"agentName":"fundamental","bias":"bullish","confidence":0.7,"reasoning":"Dovish Fed"}},{"agentName":"risk","status":"done","opinion":{"agentName":"risk","bias":"neutral","confidence":0.5,"reasoning":"Moderate risk"}},{"agentName":"sentiment","status":"done","opinion":{"agentName":"sentiment","bias":"bullish","confidence":0.6,"reasoning":"Positive news"}},{"agentName":"decision","status":"done"}],"mode":"full"}}',
  '',
  `data: {"type":"text-start","id":"${TEST_MESSAGE_ID}"}`,
  '',
  `data: {"type":"text-delta","id":"${TEST_MESSAGE_ID}","delta":"**Bottom Line:** XAUUSD is bullish with moderate confidence."}`,
  '',
  `data: {"type":"text-end","id":"${TEST_MESSAGE_ID}"}`,
  '',
  `data: {"type":"data-multi-agent-meta","id":"${TEST_MESSAGE_ID}","data":{"agentOpinions":[],"mode":"full","totalCostUsd":0.05,"totalLatencyMs":5000},"transient":true}`,
  '',
].join('\n');

export const STANDARD_MODE_SSE = [
  'data: {"type":"data-agent-progress","data":{"agents":[{"agentName":"technical","status":"done","opinion":{"agentName":"technical","bias":"bullish","confidence":0.8,"reasoning":"Uptrend"}},{"agentName":"fundamental","status":"done","opinion":{"agentName":"fundamental","bias":"bullish","confidence":0.7,"reasoning":"Macro supportive"}}],"mode":"standard"}}',
  '',
  `data: {"type":"text-start","id":"${TEST_MESSAGE_ID}"}`,
  '',
  `data: {"type":"text-delta","id":"${TEST_MESSAGE_ID}","delta":"**Bottom Line:** Standard technical and fundamental read — bullish."}`,
  '',
  `data: {"type":"text-end","id":"${TEST_MESSAGE_ID}"}`,
  '',
].join('\n');

export const QUICK_MODE_SSE = [
  'data: {"type":"data-agent-progress","data":{"agents":[{"agentName":"technical","status":"done","opinion":{"agentName":"technical","bias":"bullish","confidence":0.85,"reasoning":"Strong uptrend"}},{"agentName":"decision","status":"done"}],"mode":"quick"}}',
  '',
  `data: {"type":"text-start","id":"${TEST_MESSAGE_ID}"}`,
  '',
  `data: {"type":"text-delta","id":"${TEST_MESSAGE_ID}","delta":"**Bottom Line:** Quick technical read — bullish."}`,
  '',
  `data: {"type":"text-end","id":"${TEST_MESSAGE_ID}"}`,
  '',
].join('\n');

export const SINGLE_MODE_SSE = [
  `data: {"type":"text-start","id":"${TEST_MESSAGE_ID}"}`,
  '',
  `data: {"type":"text-delta","id":"${TEST_MESSAGE_ID}","delta":"Single agent response"}`,
  '',
  `data: {"type":"text-end","id":"${TEST_MESSAGE_ID}"}`,
  '',
].join('\n');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const test = base.extend<Fixtures, { workerUser: WorkerUserFixture }>({
  workerUser: [
    async ({}, use, workerInfo) => {
      const email = workerUserEmail(workerInfo.parallelIndex, 'user');
      const user = await ensureTestUser(email, 'password123', 'user', { resetWatchlist: true });
      const cookie = await createSessionForUser(user);
      await use({ id: user.id, email, password: 'password123', cookie });
    },
    { scope: 'worker' },
  ],

  testUser: async ({ workerUser }, use) => {
    await use({ email: workerUser.email, password: workerUser.password });
  },

  authedPage: async ({ page, workerUser }, use) => {
    await page.context().addCookies([workerUser.cookie]);
    const thread = await createThread(workerUser.id, { pinnedSymbol: null });

    // Specs commonly navigate to `/chat`, whose server redirect chooses the
    // user's latest thread.
    await page.route(/\/chat(?:\?.*)?$/, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) {
        await route.continue();
        return;
      }
      url.pathname = `/chat/${thread.id}`;
      await route.continue({ url: url.toString() });
    });

    await page.goto(`/chat/${thread.id}`);
    await use(page);
    await deleteThread(workerUser.id, thread.id).catch(() => undefined);
  },

  mockChatApi: async ({}, use) => {
    await use(mockChatApi);
  },
});

export { expect };
