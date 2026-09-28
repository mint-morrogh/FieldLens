import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Chrome's fake microphone plays a generated whistle (a stand-in for birdsong); results come
// from the demo (mock) data, so no real API calls are made.
function whistleWav(seconds: number, rate = 48_000): Buffer {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    // A falling 4 → 2.5 kHz whistle, twice a second.
    const f = 4000 - 1500 * ((t * 2) % 1);
    buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * f * t) * 12000), 44 + i * 2);
  }
  return buf;
}
const WHISTLE = path.join(tmpdir(), 'fieldlens-e2e-whistle.wav');
writeFileSync(WHISTLE, whistleWav(8));

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${WHISTLE}`,
    ],
  },
});

test('listens, identifies the call and saves it with its spectrogram', async ({ page }) => {
  await page.goto('/?mock=high');
  await page.getByTestId('listen-button-home').click();
  await expect(page.getByTestId('listen-screen')).toBeVisible();
  const button = page.getByTestId('listen-button');
  await button.click();
  // Chrome's fake microphone can take a few seconds to open.
  await expect(page.getByTestId('listen-status')).toContainText('Listening', { timeout: 30_000 });
  // Stopping is only allowed after the minimum length.
  await expect(button).toBeEnabled({ timeout: 8_000 });
  await button.click();
  await expect(page.getByTestId('result-view')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('result-headline')).toContainText('Blue Jay');
  await expect(page.getByTestId('own-photo').getByRole('img')).toHaveAttribute(
    'alt',
    'Spectrogram of your recording',
  );
  await expect(page.getByTestId('why-this-match')).toContainText('sound-model');
  await expect(page.getByRole('button', { name: 'Add another photo' })).toHaveCount(0);
  await expect(page.getByTestId('listen-again')).toBeVisible();
});
