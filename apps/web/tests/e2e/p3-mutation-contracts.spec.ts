import { expect, test } from './fixtures';

test.describe('P3 mutation confirmation contracts', () => {
  test('renders a mutation draft and executes only after confirmation', async ({ authedPage }) => {
    const page = authedPage;
    let confirmed = false;

    await page.route(/\/api\/chat(?:\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'mutation-draft',
          payload: {
            mutation: 'set_alert',
            summary: 'Set an alert for XAUUSD at 2500',
            runId: 'mutation-e2e-1',
            expiresAt: Date.now() + 60_000,
            confirmationToken: 'test-token',
          },
        }),
      }),
    );
    await page.route('**/api/chat/mutations/confirm', (route) => {
      confirmed = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          status: 'executed',
          runId: 'mutation-e2e-1',
          output: {
            status: 'executed',
            mutation: 'set_alert',
            resultId: 'alert-1',
            url: null,
            summary: 'Alert created.',
          },
        }),
      });
    });

    await page.getByRole('textbox').fill('Set an alert for XAUUSD at 2500');
    await page.getByRole('textbox').press('Enter');
    await expect(page.getByText('Set an alert for XAUUSD at 2500')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /confirm alert/i })).toBeVisible();
    expect(confirmed).toBe(false);

    await page.getByRole('button', { name: /confirm alert/i }).click();
    await expect(page.getByLabel('Mutation confirmed')).toBeVisible({ timeout: 15_000 });
    expect(confirmed).toBe(true);
  });

  test('does not execute when confirmation is cancelled', async ({ authedPage }) => {
    const page = authedPage;
    let confirmed = false;
    await page.route(/\/api\/chat(?:\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'mutation-draft',
          payload: {
            mutation: 'log_journal',
            summary: 'Log this trade idea',
            runId: 'mutation-e2e-2',
            expiresAt: Date.now() + 60_000,
            confirmationToken: 'test-token',
          },
        }),
      }),
    );
    await page.route('**/api/chat/mutations/confirm', (route) => {
      confirmed = true;
      return route.continue();
    });
    await page.route('**/api/chat/mutations/cancel', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      }),
    );

    await page.getByRole('textbox').fill('Log this trade idea');
    await page.getByRole('textbox').press('Enter');
    await expect(page.getByRole('button', { name: /^cancel$/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(page.getByLabel('Mutation declined')).toBeVisible({ timeout: 15_000 });
    expect(confirmed).toBe(false);
  });
});
