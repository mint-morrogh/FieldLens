import { expect, test } from '@playwright/test';

// Chrome's built-in fake camera; results come from the demo (mock) data, so no real API calls.
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

test('opens the camera, identifies on demand and lands on the result', async ({ page }) => {
  await page.goto('/?mock=high');
  await page.getByTestId('live-button').click();
  await expect(page.getByTestId('live-screen')).toBeVisible();
  await expect(page.getByTestId('live-status')).not.toHaveText('Starting the camera…', {
    timeout: 10_000,
  });
  // A still feed may already have triggered analysis by itself; otherwise ask for it.
  const now = page.getByRole('button', { name: 'Identify now' });
  if (await now.isEnabled().catch(() => false)) await now.click({ timeout: 2000 }).catch(() => {});
  await expect(page.getByTestId('result-view')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('result-headline')).toContainText('Acer rubrum');
});

test('can be closed back to the home screen', async ({ page }) => {
  await page.goto('/?mock=high');
  await page.getByTestId('live-button').click();
  await page.getByRole('button', { name: 'Close live identify' }).click();
  await expect(page.getByTestId('viewfinder')).toBeVisible();
});
