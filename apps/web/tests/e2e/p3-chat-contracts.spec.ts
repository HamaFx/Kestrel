import { expect, test } from './fixtures';
import { selectAnalysisMode } from './test-utils';

test.describe('P3 chat contracts', () => {
  test('renders a streamed assistant response and remains usable', async ({ authedPage }) => {
    const page = authedPage;
    await page.route(/\/api\/chat(?:\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'data: {"type":"text-start","id":"p3-message"}',
          '',
          'data: {"type":"text-delta","id":"p3-message","delta":"P3 streamed response"}',
          '',
          'data: {"type":"data-multi-agent-meta","id":"p3-message","data":{"engine":"mastra"}}',
          '',
          'data: {"type":"text-end","id":"p3-message"}',
          '',
          'data: {"type":"turn-complete","id":"p3-message","status":"persisted"}',
          '',
        ].join('\n'),
      }),
    );

    const input = page.getByRole('textbox');
    await input.fill('Explain the current market structure.');
    await input.press('Enter');
    await expect(page.getByText('P3 streamed response')).toBeVisible({ timeout: 15_000 });
    await expect(input).toBeEnabled();
  });

  test('shows a clear read-only explanation for execution requests', async ({ authedPage }) => {
    const page = authedPage;
    await page.route(/\/api\/chat(?:\?.*)?$/, (route) =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'READ_ONLY_REQUEST_REQUIRED',
            message: 'I can analyze a trade idea, but I cannot execute trades from chat.',
          },
        }),
      }),
    );

    await page.getByRole('textbox').fill('Buy gold now');
    await page.getByRole('textbox').press('Enter');
    await expect(page.getByText(/cannot execute trades from chat/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('polls a queued Full analysis to completion', async ({ authedPage }) => {
    const page = authedPage;
    let polls = 0;
    await page.route('**/api/chat/analysis-jobs/p3-full-job', (route) => {
      polls += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          polls === 1
            ? { status: 'running', progress: [] }
            : {
                status: 'complete',
                result: {
                  finalText: 'P3 Full analysis completed.',
                  mode: 'full',
                  agentOpinions: [],
                  totalCostUsd: 0.01,
                  totalLatencyMs: 100,
                },
              },
        ),
      });
    });
    await page.route(/\/api\/chat(?:\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ type: 'analysis-queued', jobId: 'p3-full-job', status: 'queued' }),
      }),
    );

    await selectAnalysisMode(page, 'full');
    await page.getByRole('textbox').fill('Run a Full XAUUSD analysis.');
    await page.getByRole('textbox').press('Enter');
    await expect(page.getByText('P3 Full analysis completed.')).toBeVisible({ timeout: 20_000 });
    expect(polls).toBeGreaterThanOrEqual(2);
  });

  test('renders a bounded multi-symbol comparison response (A-01)', async ({ authedPage }) => {
    const page = authedPage;
    await page.route(/\/api\/chat(?:\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'data: {"type":"data-agent-progress","data":{"agents":[],"mode":"single"}}',
          '',
          'data: {"type":"text-start","id":"p3-compare"}',
          '',
          'data: {"type":"text-delta","id":"p3-compare","delta":"XAUUSD remains bid while EURUSD fades."}',
          '',
          'data: {"type":"data-multi-agent-meta","id":"p3-compare","data":{"engine":"mastra","mode":"single","symbol":"XAUUSD","symbols":["XAUUSD","EURUSD"],"packetId":"packet-xauusd","comparisonPacketIds":["packet-xauusd","packet-eurusd"]}}',
          '',
          'data: {"type":"text-end","id":"p3-compare"}',
          '',
          'data: {"type":"turn-complete","id":"p3-compare","status":"persisted"}',
          '',
        ].join('\n'),
      }),
    );

    const input = page.getByRole('textbox');
    await input.fill('Compare XAUUSD and EURUSD');
    await input.press('Enter');
    await expect(page.getByText('XAUUSD remains bid while EURUSD fades.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(input).toBeEnabled();
  });

  test('surfaces the disambiguation error for over-cap comparisons (A-01)', async ({
    authedPage,
  }) => {
    const page = authedPage;
    await page.route(/\/api\/chat(?:\?.*)?$/, (route) =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'MULTI_SYMBOL_LIMIT',
            message: 'I can compare up to 3 symbols — which ones should I include?',
          },
        }),
      }),
    );

    await page.getByRole('textbox').fill('compare XAUUSD, EURUSD, GBPUSD and USDJPY');
    await page.getByRole('textbox').press('Enter');
    await expect(page.getByText(/can compare up to 3 symbols/i)).toBeVisible({ timeout: 15_000 });
  });
});
