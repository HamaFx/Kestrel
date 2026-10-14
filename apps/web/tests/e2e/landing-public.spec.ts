import { expect, test } from '@playwright/test';

test.describe('Public Landing Showcase', () => {
  test('renders Hoplite landing page sections and live telemetry ticker', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    await page.goto('/landing');
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByText(/XAU\/USD/i).first()).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();

    await context.close();
  });
});
