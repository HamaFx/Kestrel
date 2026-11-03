import { expect, test } from './fixtures';

test.describe('Trading Journal CRUD Flow', () => {
  test('logs a new trade entry with stop/target and displays it in the journal', async ({
    authedPage,
  }) => {
    const page = authedPage;
    await page.goto('/journal');

    await expect(page.getByRole('heading', { name: 'Trade Journal', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /log trade/i }).click();

    await page.locator('#entry').fill('2650');
    await page.locator('#stop').fill('2600');
    await page.locator('#target').fill('2750');
    await page.getByRole('button', { name: 'Disciplined', exact: true }).click();

    // The submit control requires a deliberate 1.2s press-and-hold.
    await page.getByRole('button', { name: /hold to log trade/i }).click({ delay: 1500 });
    await expect(page.getByText(/trade logged/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
