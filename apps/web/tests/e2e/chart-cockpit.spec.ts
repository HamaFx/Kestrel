import { expect, test } from './fixtures';

test.describe('Pro Chart Cockpit', () => {
  test('loads /chart/XAUUSD control bar, timeframe picker, and chat deep-link', async ({
    authedPage,
  }) => {
    const page = authedPage;
    await page.goto('/chart/XAUUSD');

    await expect(page.getByRole('link', { name: /analyze XAUUSD in chat/i })).toBeVisible();
    await expect(page.getByText('Timeframe')).toBeVisible();

    const tf4h = page
      .getByRole('button', { name: /^4h$/i })
      .or(page.getByRole('radio', { name: /^4h$/i }));
    if ((await tf4h.count()) > 0) {
      await tf4h.first().click();
      await expect(page).toHaveURL(/tf=4h/i);
    }
  });
});
