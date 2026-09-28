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

// The object detector is optional (a centre box is used without it). Block its download so
// these tests don't depend on a CDN or a GPU: CI's headless Linux Chromium has neither
// reliably, and the scanning flow is what's under test here.
test.beforeEach(async ({ page }) => {
  await page.route(
    /cdn\.jsdelivr\.net\/npm\/@mediapipe|storage\.googleapis\.com\/mediapipe-models/,
    (r) => r.abort(),
  );
});

test('scans automatically and shows the match over the camera', async ({ page }) => {
  await page.goto('/?mock=high');
  await page.getByRole('button', { name: 'Live identify' }).click();
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
  await page.getByRole('button', { name: 'Live identify' }).click();
  const card = page.getByTestId('live-result');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole('button', { name: 'Clear' }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('live-status')).toBeVisible();
});

test('can be closed back to the home screen', async ({ page }) => {
  await page.goto('/?mock=high');
  await page.getByRole('button', { name: 'Live identify' }).click();
  await page.getByRole('button', { name: 'Close live identify' }).click();
  await expect(page.getByTestId('viewfinder')).toBeVisible();
});

test('tapping identifies what is under the finger straight away', async ({ page }) => {
  await page.goto('/?mock=high');
  await page.getByRole('button', { name: 'Live identify' }).click();
  // The focus box appears once the camera is running.
  await expect(page.getByTestId('live-box')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('live-video').click({ position: { x: 120, y: 200 } });
  const card = page.getByTestId('live-result');
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toContainText('Red Maple');
  await expect(card).toContainText('Very likely');
});

test('uncertain matches are shown as possible, not hidden', async ({ page }) => {
  await page.goto('/?mock=low');
  await page.getByRole('button', { name: 'Live identify' }).click();
  const card = page.getByTestId('live-result');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText('Possible');
  await expect(card).toContainText('?');
});

test('data saver runs live mode light, with a quiet indicator', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fieldlens.settings.dataSaver', 'true'));
  await page.goto('/?mock=high');
  await page.getByRole('button', { name: 'Live identify' }).click();
  await expect(page.getByTestId('live-light')).toContainText('Data saver');
  await expect(page.getByTestId('live-result')).toBeVisible({ timeout: 20_000 });
});
