import { expect, test } from '@playwright/test';

test('settings shows today’s identification usage', async ({ page }) => {
  await page.goto('/?mock=high');
  await page.getByRole('link', { name: 'Settings' }).click();
  const usage = page.getByTestId('usage');
  await expect(usage).toContainText('Today’s identification usage');
  // The test server runs on demo data, so no free quota is being used.
  await expect(usage).toContainText('Demo mode is on');
});

test('default camera mode picks the home screen’s main action', async ({ page }) => {
  await page.goto('/?mock=high#/settings');
  const mode = page.getByTestId('setting-camera-mode');
  await mode.getByRole('button', { name: 'Take a photo' }).click();
  await page.goto('/?mock=high#/');
  await expect(page.getByTestId('viewfinder')).toHaveAccessibleName('Take a photo');
  await expect(page.getByRole('button', { name: 'Live identify' })).toBeVisible();

  await page.goto('/?mock=high#/settings');
  await expect(page.getByRole('switch', { name: /Name it first/ })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await page
    .getByTestId('setting-camera-mode')
    .getByRole('button', { name: 'Live identify' })
    .click();
  await page.goto('/?mock=high#/');
  await expect(page.getByTestId('viewfinder')).toHaveAccessibleName('Live identify');
});

test('clearing local data asks first', async ({ page }) => {
  await page.goto('/?mock=high#/settings');
  await page.getByTestId('clear-data').click();
  await expect(page.getByText('Clear everything on this device?')).toBeVisible();
  await page.getByTestId('clear-data-confirm').click();
  await expect(page.getByText(/has been cleared/)).toBeVisible();
});
