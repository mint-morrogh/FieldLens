import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Chrome's fake camera playing a still image (so the view "holds steady"); results come
// from the demo (mock) data, so no real API calls are made.
const STILL = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/still.y4m');
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${STILL}`,
    ],
  },
});

test('scans automatically and shows the match over the camera', async ({ page }) => {
  await page.goto('/?mock=high');
  await page.getByTestId('live-button').click();
  await expect(page.getByTestId('live-screen')).toBeVisible();
  const card = page.getByTestId('live-result');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText('Red Maple');
  await expect(card.getByRole('button', { name: 'Clear' })).toBeVisible();
  await card.getByRole('button', { name: 'Details' }).click();
  await expect(page.getByTestId('result-view')).toBeVisible();
  await expect(page.getByTestId('result-headline')).toContainText('Acer rubrum');
});

test('clearing the match resumes scanning', async ({ page }) => {
  await page.goto('/?mock=high');
  await page.getByTestId('live-button').click();
  const card = page.getByTestId('live-result');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole('button', { name: 'Clear' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('live-status')).toBeVisible();
});

test('can be closed back to the home screen', async ({ page }) => {
  await page.goto('/?mock=high');
  await page.getByTestId('live-button').click();
  await page.getByRole('button', { name: 'Close live identify' }).click();
  await expect(page.getByTestId('viewfinder')).toBeVisible();
});
