import { expect, test } from '@playwright/test';

test('settings shows today’s identification usage', async ({ page }) => {
  await page.goto('/?mock=high');
  await page.getByRole('link', { name: 'Settings' }).click();
  const usage = page.getByTestId('usage');
  await expect(usage).toContainText('Today’s identification usage');
  // The test server runs on demo data, so no free quota is being used.
  await expect(usage).toContainText('Demo mode is on');
});
