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

import { expect, FULL_MODE_SSE, SINGLE_MODE_SSE, test } from './fixtures';
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

  test('full mode streams all four desks and the synthesis in one SSE response', async ({
    authedPage,
  }) => {
    const page = authedPage;
    let modeSeen: string | undefined;
    await page.route('**/api/chat', (route) => {
      modeSeen = route.request().postDataJSON()?.analysisMode;
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
        body: FULL_MODE_SSE,
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
    await expect(page.getByText(/XAUUSD is bullish with moderate confidence/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('full mode surfaces a strict committee failure on the same SSE stream', async ({
    authedPage,
  }) => {
    const page = authedPage;
    await page.route('**/api/chat', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
        body: [
          'data: {"type":"data-agent-progress","data":{"agents":[{"agentName":"technical","status":"done"},{"agentName":"fundamental","status":"done"},{"agentName":"risk","status":"done"},{"agentName":"sentiment","status":"running"}],"mode":"full","stage":"verify"}}',
          '',
          'data: {"type":"error","errorText":"Committee analysis could not complete. Failed agents: sentiment. No partial answer was returned."}',
          '',
          'data: {"type":"turn-complete","id":"failed-turn","status":"failed"}',
          '',
        ].join('\n'),
      }),
    );

    await selectAnalysisMode(page, 'full');
    await page.getByRole('textbox').fill('Analyze XAUUSD despite missing sentiment data.');
    await page.getByRole('textbox').press('Enter');

    await expect(page.getByText(/No partial answer was returned/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/degraded committee result/i)).not.toBeVisible();
  });

  test('analysis mode pill arms Fast Scout (single) and Convene Council (full)', async ({
    authedPage,
  }) => {
    const page = authedPage;
    await page.goto('/chat');

    await selectAnalysisMode(page, 'single');
    const singleButton = page.getByRole('button', { name: /^Analysis mode: Fast Scout$/i });
    await expect(singleButton).toBeVisible();
    await expect(singleButton).toHaveAttribute('aria-pressed', 'true');

    await selectAnalysisMode(page, 'full');
    const fullButton = page.getByRole('button', { name: /^Analysis mode: Convene Council$/i });
    await expect(fullButton).toBeVisible();
    await expect(fullButton).toHaveAttribute('aria-pressed', 'true');
    await expect(singleButton).toHaveAttribute('aria-pressed', 'false');
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
});
