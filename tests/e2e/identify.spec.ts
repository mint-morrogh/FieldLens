import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LEAF = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/leaf.png');

async function choosePhoto(page: Page) {
  await page.getByTestId('photo-file-input').setInputFiles(LEAF);
  await expect(page.getByRole('heading', { name: 'Box what you want identified.' })).toBeVisible();
  await expect(page.getByTestId('crop-box')).toBeVisible();
}

async function identifySelection(page: Page) {
  await page.getByRole('button', { name: /Identify selection|Add photo and identify/ }).click();
  await expect(page.getByTestId('result-view')).toBeVisible({ timeout: 15_000 });
}

test.describe('identification flow (mock API)', () => {
  test('upload, crop, and receive a high-confidence result', async ({ page }) => {
    await page.goto('/?mock=high');
    await choosePhoto(page);
    await identifySelection(page);

    const headline = page.getByTestId('result-headline');
    await expect(headline).toHaveAttribute('data-band', 'high');
    await expect(headline).toContainText('Red Maple');
    await expect(headline).toContainText('Acer rubrum');
    await expect(headline).toContainText('identification confidence');
    await expect(page.getByTestId('alternatives').getByTestId('candidate')).toHaveCount(2);
    await expect(page.getByTestId('why-this-match')).toContainText('Strong image-model match');
    await expect(page.getByTestId('attribution')).toContainText('Demo mode');
    await expect(page.getByTestId('demo-banner')).toBeVisible();
    await expect(page.getByText('Do not use this identification alone')).toBeVisible();
  });

  test('receive a low-confidence result with guidance, then add a follow-up photo', async ({
    page,
  }) => {
    await page.goto('/?mock=low');
    await choosePhoto(page);
    await identifySelection(page);

    await expect(page.getByTestId('result-headline')).toHaveAttribute('data-band', 'low');
    await expect(page.getByTestId('group-headline')).toContainText('goldenrod (Solidago)');
    await expect(page.getByTestId('low-confidence-list').locator('li')).toHaveCount(3);
    const improve = page.getByTestId('improve');
    await expect(improve).toContainText('A photo of the flower would help.');

    // Follow-up: the button opens the native camera (a file chooser in desktop/CI browsers).
    const chooser = page.waitForEvent('filechooser');
    await improve.getByRole('button', { name: 'Add a flower photo' }).click();
    await (await chooser).setFiles(LEAF);
    await expect(page.getByRole('button', { name: 'Flower' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await identifySelection(page);

    await expect(page.getByTestId('result-headline')).toContainText('2 photos');
    await expect(page.getByTestId('why-this-match')).toContainText('2 photos submitted');
  });

  test('medium confidence shows "Likely" and prominent alternatives', async ({ page }) => {
    await page.goto('/?mock=medium');
    await choosePhoto(page);
    await identifySelection(page);
    await expect(page.getByTestId('result-headline')).toHaveAttribute('data-band', 'medium');
    await expect(page.getByTestId('result-headline')).toContainText('Likely');
    await expect(page.getByTestId('improve')).toBeVisible();
    await expect(page.getByTestId('alternatives')).toBeVisible();
  });

  test('crop box can be resized with a handle and reset', async ({ page }) => {
    await page.goto('/?mock=high');
    await choosePhoto(page);
    const box = page.getByTestId('crop-box');
    const before = (await box.boundingBox())!;
    const handle = (await page.getByTestId('crop-handle-se').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x - 60, handle.y - 40, { steps: 5 });
    await page.mouse.up();
    const after = (await box.boundingBox())!;
    expect(after.width).toBeLessThan(before.width - 30);
    expect(after.height).toBeLessThan(before.height - 20);

    await page.getByRole('button', { name: 'Use entire image' }).click();
    const full = (await box.boundingBox())!;
    const stage = (await page.getByTestId('crop-stage').boundingBox())!;
    expect(Math.round(full.width)).toBe(Math.round(stage.width));
  });

  test('denied location still identifies and says location was not used', async ({ page }) => {
    // No geolocation permission is granted in this context, so the automatic prompt is denied.
    await page.goto('/?mock=high');
    await expect(page.getByTestId('location-status')).toContainText('Location not used');
    await choosePhoto(page);
    await identifySelection(page);
    await expect(page.getByTestId('result-headline')).toContainText('Location not used');
    await expect(page.getByTestId('geo-evidence')).toContainText('Location not used');
    // Don't nag: no prompt card after reload.
    await page.goto('/');
    await expect(page.getByTestId('location-prompt')).toHaveCount(0);
  });

  test('provider quota exhausted shows a friendly error and keeps the photo', async ({ page }) => {
    await page.goto('/?mock=quota');
    await choosePhoto(page);
    await page.getByRole('button', { name: 'Identify selection' }).click();
    const error = page.getByTestId('error-state');
    await expect(error).toBeVisible();
    await expect(error).toContainText('at capacity');
    await expect(error.getByRole('img', { name: /Your photo/ })).toBeVisible();
    await expect(error.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('GBIF outage degrades gracefully', async ({ page }) => {
    await page.goto('/?mock=gbif-down');
    await choosePhoto(page);
    await identifySelection(page);
    await expect(page.getByTestId('result-headline')).toContainText('Acer rubrum');
    await expect(page.getByTestId('inat-card')).toBeVisible();
  });

  test('saved identifications reload from local history', async ({ page }) => {
    await page.goto('/?mock=high');
    await choosePhoto(page);
    await identifySelection(page);
    await page.goto('/#/history');
    await page.reload();
    const item = page.getByTestId('history-item').first();
    await expect(item).toContainText('Red Maple');
    await item.getByRole('link').click();
    await expect(page.getByTestId('result-headline')).toContainText('Acer rubrum');
    await page.getByRole('button', { name: 'Delete observation' }).click();
    await expect(page.getByText('No identifications yet.')).toBeVisible();
  });
});

test('shows the live analysis checklist and a reference gallery', async ({ page }) => {
  // Slow the response slightly so the in-progress screen is observable.
  await page.route('**/api/identify', async (route) => {
    await new Promise((r) => setTimeout(r, 600));
    await route.continue();
  });
  await page.goto('/?mock=high');
  await choosePhoto(page);
  await page.getByRole('button', { name: 'Identify selection' }).click();
  const steps = page.getByTestId('analysis-steps');
  await expect(steps).toBeVisible();
  await expect(steps.locator('[data-step="identify"]')).toBeVisible();
  await expect(page.getByTestId('result-view')).toBeVisible({ timeout: 15_000 });
  const gallery = page.getByTestId('reference-gallery');
  await expect(gallery).toBeVisible();
  await gallery.getByRole('button').first().click();
  await expect(page.getByTestId('lightbox')).toContainText('CC0');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lightbox')).toHaveCount(0);
});

test.describe('with location permission', () => {
  test.use({
    permissions: ['geolocation'],
    geolocation: { latitude: 46.2382, longitude: -63.1311 },
  });

  test('uses approximate location and shows the separate iNaturalist card', async ({ page }) => {
    await page.goto('/?mock=high');
    await expect(page.getByTestId('location-status')).toContainText('Location: Ready');
    await choosePhoto(page);
    await identifySelection(page);

    await expect(page.getByTestId('result-headline')).toContainText(
      'Location used (~46.2°N, 63.1°W)',
    );
    const inat = page.getByTestId('inat-card');
    await expect(inat.getByRole('heading', { name: 'From iNaturalist' })).toBeVisible();
    await expect(inat).toContainText('observations within 25 km');
    await expect(inat).toContainText('do not independently confirm this identification');
    await expect(inat.getByRole('link', { name: /View on iNaturalist/ })).toBeVisible();
    await expect(page.getByTestId('geo-evidence')).toContainText('within 5 km');
    await expect(page.getByTestId('nearby-species')).toContainText(
      'Other Acer species recorded nearby',
    );
  });

  test('iNaturalist outage is shown inside its own card only', async ({ page }) => {
    await page.goto('/?mock=inat-down');
    await choosePhoto(page);
    await identifySelection(page);
    await expect(page.getByTestId('inat-card')).toContainText(
      'iNaturalist information is temporarily unavailable.',
    );
    await expect(page.getByTestId('result-headline')).toHaveAttribute('data-band', 'high');
  });
});

test('offline: app shell loads from the service worker and photos are kept', async ({
  page,
  context,
}) => {
  await page.goto('/?mock=high');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Make sure the page is controlled before going offline.
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Take a Photo' })).toBeVisible();
  await expect(page.getByTestId('offline-banner')).toBeVisible();

  await choosePhoto(page);
  await page.getByRole('button', { name: 'Identify selection' }).click();
  const error = page.getByTestId('error-state');
  await expect(error).toContainText('You’re offline.');
  await expect(error).toContainText('Your photo is still here.');

  await context.setOffline(false);
  await expect(page.getByTestId('result-view')).toBeVisible({ timeout: 15_000 });
});
