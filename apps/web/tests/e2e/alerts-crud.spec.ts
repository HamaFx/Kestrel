import { expect, test } from './fixtures';

test.describe('Alerts CRUD Flow', () => {
  test('opens New alert drawer, creates a price alert, pauses/re-arms it, and deletes it', async ({
    authedPage,
  }) => {
    const page = authedPage;
    await page.goto('/alerts');

    await expect(page.getByRole('heading', { name: 'Alerts', exact: true })).toBeVisible();

    const openBtn = page.getByRole('button', { name: /create alert|new alert/i }).first();
    await openBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.locator('#alert-level').fill('2850');
    await page.locator('#alert-note').fill('E2E resistance level');

    // The 400ms-debounced historical preview inserts a status callout above the
    // submit button; wait for it so the button is stable before clicking.
    await expect(dialog.getByRole('status')).toBeVisible({ timeout: 20_000 });
    const createButton = dialog.getByRole('button', { name: /^create alert$/i });
    await createButton.scrollIntoViewIfNeeded();
    await createButton.click();

    await expect(page.getByText(/XAUUSD price above 2850/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const pauseBtn = page.getByRole('button', { name: /pause alert/i }).first();
    await pauseBtn.click();
    await expect(page.getByRole('button', { name: /re-arm alert/i }).first()).toBeVisible();

    await page
      .getByRole('button', { name: /delete alert/i })
      .first()
      .click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
  });
});
