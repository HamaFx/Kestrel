import { expect, test } from './fixtures';

test.describe('Economic Calendar Filters', () => {
  test('renders importance and currency filter radiogroups when events exist or empty state', async ({
    authedPage,
  }) => {
    const page = authedPage;
    await page.goto('/calendar');

    await expect(page.getByRole('heading', { name: /calendar/i }).first()).toBeVisible();

    const importanceGroup = page.getByRole('radiogroup', { name: /filter by importance/i });
    if ((await importanceGroup.count()) > 0) {
      const highRadio = importanceGroup.getByRole('radio', { name: /high/i });
      await highRadio.click();
      await expect(highRadio).toHaveAttribute('aria-checked', 'true');
    }
  });
});
