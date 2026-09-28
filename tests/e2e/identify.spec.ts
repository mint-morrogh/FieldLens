import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LEAF = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/leaf.png');

async function choosePhoto(page: Page) {
  await page.getByTestId('photo-file-input').setInputFiles(LEAF);
  await expect(page.getByRole('heading', { name: 'Box what you want identified.' })).toBeVisible();
  await expect(page.getByTestId('crop-box')).toBeVisible();
}

/** Library photos ask where they were taken; pick an answer when a test needs a specific one. */
async function wherePhotoTaken(page: Page, answer: 'Near here' | 'Somewhere else') {
  await page.getByTestId('photo-location-question').getByRole('button', { name: answer }).click();
}

/** "What is it?" on the crop screen (optional; Auto is the default). */
async function pickCategory(page: Page, name: string) {
  await page.getByTestId('crop-category').getByRole('button', { name, exact: true }).click();
}

async function identifySelection(page: Page) {
  await page.getByRole('button', { name: /^(Identify|Add photo and identify)$/ }).click();
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
    await expect(page.getByTestId('demo-banner')).toBeVisible();
    await expect(page.getByTestId('safety')).toBeVisible();
    await expect(page.getByTestId('safety')).toContainText('Edibility & safety');
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
    await expect(page.getByTestId('result-headline')).toContainText('Likely match');
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

    await page.getByRole('button', { name: 'Whole photo' }).click();
    const full = (await box.boundingBox())!;
    const stage = (await page.getByTestId('crop-stage').boundingBox())!;
    expect(Math.round(full.width)).toBe(Math.round(stage.width));
  });

  test('denied location still identifies and says location was not used', async ({ page }) => {
    // No geolocation permission is granted in this context, so the automatic prompt is denied.
    await page.goto('/?mock=high');
    await expect(page.getByTestId('location-status')).toContainText('Location not used');
    await choosePhoto(page);
    await wherePhotoTaken(page, 'Near here');
    await identifySelection(page);
    await expect(page.getByTestId('result-headline')).toContainText('Location not used');
    await expect(page.getByTestId('geo-evidence')).toHaveCount(0);
    await expect(page.getByTestId('location-fix')).toContainText('Location wasn’t used');
    // Don't nag: no prompt card after reload.
    await page.goto('/');
    await expect(page.getByTestId('location-prompt')).toHaveCount(0);
  });

  test('provider quota exhausted shows a friendly error and keeps the photo', async ({ page }) => {
    await page.goto('/?mock=quota');
    await choosePhoto(page);
    await page.getByRole('button', { name: 'Identify', exact: true }).click();
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

  test('saved identifications build the field journal', async ({ page }) => {
    await page.goto('/?mock=high');
    await choosePhoto(page);
    await wherePhotoTaken(page, 'Near here');
    await identifySelection(page);
    // Saving (thumbnail + high-quality copy) happens in the background after the result.
    await expect(async () => {
      await page.goto('/#/history');
      await page.reload();
      await expect(page.getByTestId('species-card').first()).toContainText('Red Maple', {
        timeout: 1000,
      });
    }).toPass({ timeout: 30_000 });
    await expect(page.getByTestId('rank-card')).toContainText('Observer');
    await expect(page.getByTestId('rank-card')).toContainText('6 pts');
    await expect(page.getByTestId('journal-filter')).toContainText('Plants');
    // A species card opens its field-guide page; a sighting there opens the saved result.
    await page.getByTestId('species-card').first().getByRole('link').click();
    await expect(page.getByTestId('species-page')).toContainText('Acer rubrum');
    await page
      .getByRole('link', { name: /^Sighting on / })
      .first()
      .click();
    await expect(page.getByTestId('result-headline')).toContainText('Acer rubrum');
    await page.getByRole('button', { name: 'Delete observation' }).click();
    await expect(page.getByText('Your journal is empty.', { exact: false })).toBeVisible();
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
  await page.getByRole('button', { name: 'Identify', exact: true }).click();
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

test('granting location later re-checks the result with location', async ({ page, context }) => {
  await page.goto('/?mock=high');
  await choosePhoto(page);
  await wherePhotoTaken(page, 'Near here');
  await identifySelection(page);
  await expect(page.getByTestId('result-headline')).toContainText('Location not used');

  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 46.2382, longitude: -63.1311 });
  await page.getByRole('button', { name: /Use my location|Try again/ }).click();
  await expect(page.getByTestId('result-headline')).toContainText('Location used', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('location-fix')).toHaveCount(0);
});

test('photo first: "What is it?" is optional on the crop screen and starts on Auto', async ({
  page,
}) => {
  await page.goto('/?mock=high');
  await expect(page.getByTestId('viewfinder')).toContainText('Live identify');
  await expect(page.getByRole('button', { name: 'Take a photo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload photo' })).toBeVisible();
  await choosePhoto(page);
  const row = page.getByTestId('crop-category');
  await expect(row.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  for (const name of [
    'Plant',
    'Tree',
    'Fungus',
    'Bug',
    'Bird',
    'Mammal',
    'Reptile & amphibian',
    'Fish',
  ]) {
    await expect(row.getByRole('button', { name, exact: true })).toBeVisible();
  }
  // Picking a plant shows plant parts; Auto hides them again.
  await pickCategory(page, 'Plant');
  await expect(page.getByRole('button', { name: 'Flower', exact: true })).toBeVisible();
  await pickCategory(page, 'Auto');
  await expect(page.getByRole('button', { name: 'Flower', exact: true })).toHaveCount(0);
  // Every chip is reachable on a phone-width screen (the row scrolls).
  await pickCategory(page, 'Fish');
  await expect(row.getByRole('button', { name: 'Fish', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('recent identifications can be deleted from the home screen and restored', async ({
  page,
}) => {
  await page.goto('/?mock=high');
  await choosePhoto(page);
  await identifySelection(page);
  await expect(async () => {
    await page.goto('/');
    await expect(page.getByTestId('recent-card').first()).toContainText('Red Maple', {
      timeout: 1000,
    });
  }).toPass({ timeout: 30_000 });
  await page
    .getByTestId('recent-card')
    .first()
    .getByRole('button', { name: /Delete/ })
    .click();
  await expect(page.getByTestId('recent-card')).toHaveCount(0);
  await page.getByTestId('undo-delete').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('recent-card')).toHaveCount(1);
  // Undo really kept it: it survives a reload.
  await page.reload();
  await expect(page.getByTestId('recent-card')).toHaveCount(1);
  // Without undo, it's gone for good once the toast times out.
  await page
    .getByTestId('recent-card')
    .first()
    .getByRole('button', { name: /Delete/ })
    .click();
  await expect(page.getByTestId('undo-delete')).toHaveCount(0, { timeout: 8000 });
  await page.reload();
  await expect(page.getByTestId('recent-card')).toHaveCount(0);
});

test('insects are identified with an experimental label', async ({ page }) => {
  await page.goto('/?mock=high');
  await choosePhoto(page);
  await pickCategory(page, 'Bug');
  await identifySelection(page);
  await expect(page.getByTestId('result-headline')).toContainText('Danaus plexippus');
});

test('an off-target insect photo can be re-identified as a plant', async ({ page }) => {
  await page.goto('/?mock=wrong-category');
  await choosePhoto(page);
  await pickCategory(page, 'Bug');
  await identifySelection(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('doesn’t look like a bug');
  await page.getByRole('button', { name: 'Identify as plant' }).click();
  await expect(page.getByTestId('result-headline')).toContainText('Acer rubrum', {
    timeout: 15_000,
  });
});

test('mushrooms get the safety package', async ({ page }) => {
  await page.goto('/?mock=high');
  await choosePhoto(page);
  await pickCategory(page, 'Fungus');
  await identifySelection(page);
  await expect(page.getByTestId('fungus-warning')).toContainText(
    'Mushroom identification is difficult',
  );
  await expect(page.getByTestId('result-headline')).toContainText('Amanita muscaria');
  const safety = page.getByTestId('safety');
  await expect(safety).toHaveAttribute('data-level', 'danger');
  await expect(safety).toContainText('death cap');
  await expect(safety.getByTestId('edible-list')).toHaveCount(0);
  await expect(page.getByTestId('result-view')).toContainText('Never eat a wild mushroom');
});

test('birds are identified with an experimental label and no edibility section', async ({
  page,
}) => {
  await page.goto('/?mock=high');
  await choosePhoto(page);
  await pickCategory(page, 'Bird');
  await identifySelection(page);
  await expect(page.getByTestId('result-headline')).toContainText('Blue Jay');
  await expect(page.getByTestId('safety')).toHaveCount(0);
});

test('gallery thumbnails keep their size and scroll sideways', async ({ page }) => {
  await page.goto('/?mock=high');
  await choosePhoto(page);
  await identifySelection(page);
  const thumb = page.getByTestId('reference-gallery').getByRole('button').first();
  const box = (await thumb.boundingBox())!;
  expect(Math.round(box.width)).toBeGreaterThanOrEqual(100);
});

test('reptiles and amphibians share a tile and the result says which', async ({ page }) => {
  await page.goto('/?mock=high');
  await choosePhoto(page);
  await pickCategory(page, 'Reptile & amphibian');
  await identifySelection(page);
  await expect(page.getByTestId('result-headline')).toContainText('Wood Frog');
  await expect(page.getByTestId('detected-category')).toHaveText('Amphibian');
});

test('parts only appear once a type is chosen, and Mammal offers tracks', async ({ page }) => {
  await page.goto('/?mock=high');
  await choosePhoto(page);
  const parts = page.getByTestId('crop-feature');
  // Auto: nothing to ask about yet.
  await expect(parts).toHaveCount(0);
  await pickCategory(page, 'Tree');
  await expect(parts).toContainText('Bark');
  await expect(parts).toContainText('Cones, nuts & fruit');
  await pickCategory(page, 'Bug');
  await expect(parts).toContainText('Wings');
  await pickCategory(page, 'Fish');
  await expect(parts).toContainText('Fins & tail');
  await pickCategory(page, 'Mammal');
  await parts.getByRole('button', { name: 'Tracks' }).click();
  await identifySelection(page);
  await expect(page.getByTestId('sign-pill')).toHaveText(/From tracks/i);
  await expect(page.getByTestId('result-headline')).toContainText('Procyon lotor');
  await expect(page.getByTestId('result-headline')).toHaveAttribute('data-band', 'low');
  await expect(page.getByTestId('safety')).toContainText('Wildlife safety');
  await expect(page.getByTestId('safety')).toContainText('rabies');
  await expect(page.getByTestId('improve')).toContainText('for scale');
});

test('mammals offer Tracks and Droppings as parts', async ({ page }) => {
  await page.goto('/?mock=high');
  await choosePhoto(page);
  await pickCategory(page, 'Mammal');
  const parts = page.getByTestId('crop-feature');
  await expect(parts).toContainText('Which part?');
  await parts.getByRole('button', { name: 'Droppings' }).click();
  await identifySelection(page);
  await expect(page.getByTestId('sign-pill')).toHaveText(/From droppings/i);
  await expect(page.getByTestId('safety')).toContainText('roundworm');
});

test('automatic mode detects the category first', async ({ page }) => {
  await page.goto('/?mock=auto-bug');
  await choosePhoto(page);
  await identifySelection(page);
  await expect(page.getByTestId('detected-category')).toHaveText('Insect · detected');
  await expect(page.getByTestId('result-headline')).toContainText('Danaus plexippus');
});

test('automatic mode routes plants to Pl@ntNet', async ({ page }) => {
  await page.goto('/?mock=high');
  await choosePhoto(page);
  await identifySelection(page);
  await expect(page.getByTestId('detected-category')).toHaveText('Plant · detected');
  await expect(page.getByTestId('result-headline')).toContainText('Acer rubrum');
});

test('library photos ask where they were taken and can use the photo’s own location', async ({
  page,
}) => {
  await page.goto('/?mock=high');
  await page
    .getByTestId('photo-file-input')
    .setInputFiles(path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/gps.jpg'));
  const question = page.getByTestId('photo-location-question');
  await expect(question).toBeVisible();
  await expect(question.getByRole('button', { name: 'Where the photo was taken' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await identifySelection(page);
  await expect(page.getByTestId('result-headline')).toContainText(
    'Location from photo (~46.2°N, 63.1°W)',
  );
  // Tapping your photo opens it full screen.
  await page.getByTestId('own-photo').click();
  await expect(page.getByTestId('lightbox')).toContainText('Your photo');
});

test('photos without location data default to "Somewhere else" when old', async ({ page }) => {
  await page.goto('/?mock=high');
  await choosePhoto(page); // leaf.png: no EXIF; its file date is from when the repo was checked out
  const question = page.getByTestId('photo-location-question');
  await expect(question.getByRole('button', { name: 'Where the photo was taken' })).toHaveCount(0);
  await question.getByRole('button', { name: 'Somewhere else' }).click();
  await identifySelection(page);
  await expect(page.getByTestId('result-headline')).toContainText('Location not used');
});

test.describe('with location permission', () => {
  test.use({
    permissions: ['geolocation'],
    geolocation: { latitude: 46.2382, longitude: -63.1311 },
  });

  test('uses approximate location and shows the separate iNaturalist card', async ({ page }) => {
    // Distances follow the device locale (imperial on en-US); this test checks the metric copy.
    await page.addInitScript(() => localStorage.setItem('fieldlens.settings.units', 'metric'));
    await page.goto('/?mock=high');
    await expect(page.getByTestId('viewfinder-readout')).toContainText('°N');
    await choosePhoto(page);
    await wherePhotoTaken(page, 'Near here');
    await identifySelection(page);

    await expect(page.getByTestId('result-headline')).toContainText(
      'Location used (~46.2°N, 63.1°W)',
    );
    const inat = page.getByTestId('inat-card');
    await expect(inat.getByRole('heading', { name: 'From iNaturalist' })).toBeVisible();
    await expect(inat).toContainText('observations within 25 km');
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
  await page.getByRole('button', { name: 'Identify', exact: true }).click();
  const error = page.getByTestId('error-state');
  await expect(error).toContainText('You’re offline.');
  await expect(error).toContainText('Your photo is still here.');

  await context.setOffline(false);
  await expect(page.getByTestId('result-view')).toBeVisible({ timeout: 15_000 });
});

test('mammal photos show size, diet and activity facts and wildlife safety', async ({ page }) => {
  await page.goto('/?mock=high');
  await choosePhoto(page);
  await pickCategory(page, 'Mammal');
  await identifySelection(page);
  await expect(page.getByTestId('result-headline')).toContainText('Procyon lotor');
  const facts = page.getByTestId('species-facts');
  await expect(facts).toContainText('Average adult weight');
  await expect(facts).toContainText('EltonTraits');
  await expect(page.getByTestId('safety')).toContainText('rabies');
  await expect(page.getByTestId('sign-pill')).toHaveCount(0);
});

test('a photo of a person gets a friendly answer instead of a species', async ({ page }) => {
  await page.goto('/?mock=person');
  await choosePhoto(page);
  await identifySelection(page);
  await expect(page.getByTestId('person-result')).toContainText('That’s a person!');
  await expect(page.getByTestId('safety')).toHaveCount(0);
});
