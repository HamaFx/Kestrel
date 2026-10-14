import { expect, test } from './fixtures';

test.describe('Portfolio & Risk Engine', () => {
  test('creates an open position via API and renders exposure and risk summary cards', async ({
    authedPage,
  }) => {
    const page = authedPage;
    await page.goto('/settings/portfolio');

    const cookies = await page.context().cookies();
    const csrf = cookies.find((c) => c.name === 'hfx_csrf' || c.name === '__Host-hfx_csrf')?.value;

    const createRes = await page.request.post('/api/portfolio/positions', {
      data: {
        symbol: 'XAUUSD',
        direction: 'long',
        entryPrice: 2650,
        stopLoss: 2600,
        takeProfit: 2750,
        lotSize: 1,
        openedAt: Date.now(),
      },
      ...(csrf ? { headers: { 'x-csrf-token': csrf } } : {}),
    });
    expect(createRes.ok()).toBeTruthy();

    await page.reload();
    await expect(page.getByRole('heading', { name: /portfolio/i }).first()).toBeVisible();
    await expect(page.getByText('Open Positions')).toBeVisible();
    await expect(page.getByText('Total Exposure')).toBeVisible();
    await expect(page.getByText('Total Risk')).toBeVisible();
  });
});
