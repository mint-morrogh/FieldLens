/**
 * BirdNET v2.4's first layers (`MelSpecLayerSimple`) turn raw audio into a mel spectrogram
 * inside the model. In Keras the layer is:
 *
 *   x = 2 * ((x - min) / (max - min + 1e-6) - 0.5)          per window
 *   s = real(stft(x, frame_length, frame_step, hann))       tf.cast(complex → float) keeps
 *                                                           the real part, not the magnitude
 *   s = (s · mel_filterbank) ** 2
 *   s = s ** (1 / (1 + exp(magnitude_scaling)))
 *   s = transpose(reverse(s, mel axis)) + channel axis      → [mels, frames, 1]
 *
 * Everything up to the square is linear in the frame, so window × real DFT × filterbank folds
 * into one [frameLength × mels] matrix, and the whole STFT + mel step becomes a single strided
 * 1-D convolution. That runs on every TF.js backend (WebGL, WASM, CPU) with no custom FFT
 * kernel. It costs about as much as an FFT followed by the mel projection, and far less than
 * TF.js's own WebGL `rfft`, which is a direct O(N²) DFT. Our own implementation,
 * written from the Keras layer's definition (see docs/research/birdnet-browser.md on why the
 * birdnet-web kernel isn't reused).
 */

/**
 * The combined kernel: `k[n][m] = hann(n) · Σ_j cos(2π j n / N) · fb[j][m]`, row-major
 * [frameLength × mels]. `filterbank` is [frameLength / 2 + 1 × mels], as stored in the layer
 * config. Hann is the periodic window, which is what `tf.signal.hann_window` uses by default.
 */
export function melKernel(
  frameLength: number,
  filterbank: readonly (readonly number[])[],
): Float32Array {
  const bins = frameLength / 2 + 1;
  if (!Number.isInteger(bins) || filterbank.length !== bins) {
    throw new RangeError(`Expected ${bins} filterbank rows for frames of ${frameLength}`);
  }
  const mels = filterbank[0].length;
  // Only the filterbank's non-zero bins contribute; each mel band covers a handful of them.
  const bands: { bin: number; weights: { m: number; w: number }[] }[] = [];
  for (let j = 0; j < bins; j++) {
    const weights: { m: number; w: number }[] = [];
    filterbank[j].forEach((w, m) => w !== 0 && weights.push({ m, w }));
    if (weights.length) bands.push({ bin: j, weights });
  }
  const cos = new Float64Array(frameLength);
  for (let i = 0; i < frameLength; i++) cos[i] = Math.cos((2 * Math.PI * i) / frameLength);
  const out = new Float32Array(frameLength * mels);
  const row = new Float64Array(mels);
  for (let n = 0; n < frameLength; n++) {
    row.fill(0);
    for (const { bin, weights } of bands) {
      const c = cos[(bin * n) % frameLength];
      for (const { m, w } of weights) row[m] += c * w;
    }
    const hann = 0.5 - 0.5 * cos[n];
    for (let m = 0; m < mels; m++) out[n * mels + m] = hann * row[m];
  }
  return out;
}

/** Frames produced by a valid (unpadded) STFT, as in `tf.signal.stft(..., pad_end=False)`. */
export function frameCount(samples: number, frameLength: number, frameStep: number): number {
  return samples < frameLength ? 0 : Math.floor((samples - frameLength) / frameStep) + 1;
}
