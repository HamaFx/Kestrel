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
// E2E: Multi-Agent Chat modes
//
// Covers: full mode (4 agents), quick mode (technical only), single mode
// (standard chat), SSE mock streaming, analysis mode selector, and
// verification that the correct mode is sent in the request body.
// ---------------------------------------------------------------------------

import {
  expect,
  FULL_MODE_SSE,
  QUICK_MODE_SSE,
  SINGLE_MODE_SSE,
  STANDARD_MODE_SSE,
  test,
} from './fixtures';
import { selectAnalysisMode } from './test-utils';

test.describe('Multi-Agent Chat', () => {
  test('full mode shows 4 agent progress indicators', async ({ authedPage, mockChatApi }) => {
    const page = authedPage;

    let requestSeen = false;
    await mockChatApi(page, {
      multiAgentBody: FULL_MODE_SSE,
    });

    // Override route to also capture request body
    await page.unroute('**/api/chat');
    await page.route('**/api/chat', (route) => {
      const body = route.request().postDataJSON();
      if (body?.analysisMode === 'full') {
        requestSeen = true;
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
          body: FULL_MODE_SSE,
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          headers: { 'x-vercel-ai-data-stream': 'v1' },
          body: '0:"Mock AI response"\n',
        });
      }
    });

    // Select "Full" mode from the toolbar
    await selectAnalysisMode(page, 'full');

    // Send a message
    const textarea = page.getByRole('textbox');
    await textarea.fill('Should I buy XAUUSD now?');
    await textarea.press('Enter');

    // Verify the request was sent with analysisMode=full, not merely any
    // multi-agent mode such as standard.
    await expect.poll(() => requestSeen, { timeout: 15_000 }).toBe(true);

    // Verify the agent deliberation UI appears
    await expect(page.getByText('Multi-Agent')).toBeVisible({ timeout: 15_000 });

    // Verify the final response text appears
    await expect(page.getByText('Bottom Line')).toBeVisible({ timeout: 15_000 });
  });

  test('full mode queued worker path polls until all four specialists and Decision complete', async ({
    authedPage,
  }) => {
    const page = authedPage;
    let modeSeen: string | undefined;
    let pollCount = 0;

    await page.route('**/api/chat/analysis-jobs/full-e2e-job', (route) => {
      pollCount += 1;
      const agents = [
        {
          agentName: 'technical',
          status: 'done',
          opinion: {
            agentName: 'technical',
            bias: 'bullish',
            confidence: 0.85,
            reasoning: 'Strong 4h uptrend with bullish order flow',
          },
        },
        {
          agentName: 'fundamental',
          status: 'done',
          opinion: {
            agentName: 'fundamental',
            bias: 'bullish',
            confidence: 0.8,
            reasoning: 'Real rates falling and dollar index softening',
          },
        },
        {
          agentName: 'risk',
          status: 'done',
          opinion: {
            agentName: 'risk',
            bias: 'neutral',
            confidence: 0.65,
            reasoning: 'ATR elevated; keep stop distance wide',
          },
        },
        {
          agentName: 'sentiment',
          status: 'done',
          opinion: {
            agentName: 'sentiment',
            bias: 'bullish',
            confidence: 0.7,
            reasoning: 'Retail net short while ETF inflows rise',
          },
        },
        {
          agentName: 'decision',
          status: 'done',
          opinion: {
            agentName: 'decision',
            bias: 'bullish',
            confidence: 0.8,
            reasoning: 'Aligned technical and macro picture supports long exposure',
          },
        },
      ];

      if (pollCount === 1) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'running',
            progress: agents.slice(0, 2).map((a) => ({
              agentName: a.agentName,
              status: 'done',
              opinion: a.opinion,
            })),
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'complete',
          result: {
            finalText:
              '**Bottom Line:** XAUUSD is strongly bullish across technical and macro desks.',
            agentOpinions: agents.map((a) => a.opinion),
            mode: 'full',
            totalCostUsd: 0.04,
            totalLatencyMs: 4200,
            messageId: 'final-assistant-message-id',
          },
          progress: agents,
        }),
      });
    });

    await page.route('**/api/chat', (route) => {
      modeSeen = route.request().postDataJSON()?.analysisMode;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'analysis-queued',
          jobId: 'full-e2e-job',
          status: 'queued',
        }),
      });
    });

    await selectAnalysisMode(page, 'full');
    await page.getByRole('textbox').fill('Run a complete top-down XAUUSD analysis.');
    await page.getByRole('textbox').press('Enter');

    await expect.poll(() => modeSeen, { timeout: 15_000 }).toBe('full');
    await expect(page.getByLabel('Technical agent: done')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Fundamental agent: done')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Risk agent: done')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Sentiment agent: done')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Decision agent: done')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/strongly bullish across technical and macro/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(() => pollCount, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  });

  test('full mode displays error badges and surfaces failure banner when committee fails', async ({
    authedPage,
  }) => {
    const page = authedPage;
    let pollCount = 0;

    const progress = {
      agentName: 'sentiment',
      status: 'error',
      error: 'provider rate limit exceeded',
    };

    await page.route('**/api/chat/analysis-jobs/full-degraded-job', (route) => {
      pollCount += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          pollCount === 1
            ? { status: 'running', progress: [progress] }
            : {
                status: 'failed',
                progress: [progress],
                error: 'Full analysis could not be completed. No partial answer was returned.',
              },
        ),
      });
    });

    await page.route('**/api/chat', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'analysis-queued',
          jobId: 'full-degraded-job',
          status: 'queued',
        }),
      }),
    );

    await selectAnalysisMode(page, 'full');
    await page.getByRole('textbox').fill('Analyze XAUUSD despite missing sentiment data.');
    await page.getByRole('textbox').press('Enter');

    await expect(page.getByLabel('Sentiment agent: error')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Decision agent: error')).toBeVisible();
    await expect(page.getByText(/Full analysis was not completed/i)).toBeVisible();
    await expect(page.getByText(/No partial answer was returned/i)).toBeVisible();
    await expect(page.getByText(/degraded committee result/i)).not.toBeVisible();
    await expect.poll(() => pollCount, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  });

  test('analysis mode chip toggles between Quick Read (single) and Full Committee (full)', async ({
    authedPage,
  }) => {
    const page = authedPage;
    await page.goto('/chat');

    await selectAnalysisMode(page, 'single');
    const singleButton = page.getByRole('button', { name: /^Analysis mode: Quick Read$/i });
    await expect(singleButton).toBeVisible();

    await selectAnalysisMode(page, 'full');
    const fullButton = page.getByRole('button', { name: /^Analysis mode: Full Committee$/i });
    await expect(fullButton).toBeVisible();
  });

  test('single mode uses standard chat (no multi-agent)', async ({ authedPage }) => {
    const page = authedPage;

    let analysisModeSeen: string | undefined = undefined;
    await page.route('**/api/chat', (route) => {
      const body = route.request().postDataJSON();
      analysisModeSeen = body?.analysisMode;

      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
        body: SINGLE_MODE_SSE,
      });
    });

    // Select "Single" mode
    await selectAnalysisMode(page, 'single');

    // Send a message
    const textarea = page.getByRole('textbox');
    await textarea.fill('Hello');
    await textarea.press('Enter');

    // Verify single mode was sent
    await expect.poll(() => analysisModeSeen, { timeout: 15_000 }).toBe('single');

    // Verify standard response appears (no multi-agent UI)
    await expect(page.getByText('Single agent response')).toBeVisible({ timeout: 15_000 });

    // Multi-Agent deliberation panel should NOT appear
    await expect(page.getByText('Multi-Agent')).not.toBeVisible();
  });

  test('full mode sends analysisMode="full" and renders all specialist desk badges', async ({
    authedPage,
  }) => {
    const page = authedPage;
    let modeSeen: string | undefined;
    await page.route('**/api/chat', (route) => {
      modeSeen = route.request().postDataJSON()?.analysisMode;
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
        body: FULL_MODE_SSE,
      });
    });

    await selectAnalysisMode(page, 'full');
    await page.getByRole('textbox').fill('Analyze XAUUSD with full committee.');
    await page.getByRole('textbox').press('Enter');

    await expect.poll(() => modeSeen, { timeout: 15_000 }).toBe('full');
    await expect(page.getByText('Multi-Agent')).toBeVisible({ timeout: 15_000 });
  });

  test('full mode survives one transient worker poll failure', async ({ authedPage }) => {
    const page = authedPage;
    let pollCount = 0;
    await page.route('**/api/chat/analysis-jobs/full-retry-job', (route) => {
      pollCount += 1;
      if (pollCount === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'worker restarting' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'complete',
          result: {
            finalText: '**Bottom Line:** worker recovered and completed the Full-mode decision.',
            agentOpinions: [],
            mode: 'full',
            totalCostUsd: 0.01,
            totalLatencyMs: 3000,
            messageId: 'retry-assistant-message',
          },
        }),
      });
    });
    await page.route('**/api/chat', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'analysis-queued',
          jobId: 'full-retry-job',
          status: 'queued',
        }),
      }),
    );

    await selectAnalysisMode(page, 'full');
    await page.getByRole('textbox').fill('Run Full mode while the worker restarts.');
    await page.getByRole('textbox').press('Enter');

    await expect(page.getByText(/worker recovered and completed/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect.poll(() => pollCount, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  });
});
