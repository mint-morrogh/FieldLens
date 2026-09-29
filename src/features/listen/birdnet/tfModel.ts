/**
 * Loads BirdNET v2.4 (TF.js) from the dedicated cache and runs it. Worker only: this module
 * pulls in TF.js, so it must never be imported from the page.
 *
 * Backends: WebGL first (fast; needs OffscreenCanvas in workers and float32 render targets,
 * since half-float textures lose too much precision in the spectrogram), then WASM.
 */
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import { loadGraphModel } from '@tensorflow/tfjs-converter';
import * as tfl from '@tensorflow/tfjs-layers';
import wasmPlainUrl from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm.wasm?url';
import wasmSimdUrl from '@tensorflow/tfjs-backend-wasm/dist/tfjs-backend-wasm-simd.wasm?url';
import { BIRDNET_V24 } from './audioWindows';
import {
  ACOUSTIC_MODEL,
  BIRDNET_CACHE,
  BIRDNET_MODEL_REVISION,
  COMPLETE_MARKER,
  LABELS_FILE,
  LOCATION_MODEL,
  cacheKey,
} from './manifest';
import { frameCount, melKernel } from './melSpec';
import { BATCH_WINDOWS, ModelNotDownloadedError, type BirdnetModel } from './protocol';
import { geoInput, parseLabels } from './scores';

// Threads need cross-origin isolation, which FieldLens doesn't have, so the threaded binary
// is never picked; it maps to the SIMD one only so no request goes to a missing file.
setWasmPaths({
  'tfjs-backend-wasm.wasm': wasmPlainUrl,
  'tfjs-backend-wasm-simd.wasm': wasmSimdUrl,
  'tfjs-backend-wasm-threaded-simd.wasm': wasmSimdUrl,
});

type MelSpecConfig = {
  name?: string;
  frameLength: number;
  frameStep: number;
  specShape: [number, number];
  melFilterbank: number[][];
  sampleRate?: number;
  fmin?: number;
  fmax?: number;
  dataFormat?: string;
};

/** BirdNET's spectrogram layer; see ./melSpec.ts for how it's computed. */
class MelSpecLayerSimple extends tfl.layers.Layer {
  static className = 'MelSpecLayerSimple';
  private readonly spec: MelSpecConfig;
  private kernel?: tf.Tensor3D;
  private magScale?: tfl.LayerVariable;

  constructor(config: MelSpecConfig) {
    super({ name: config.name, trainable: false, dtype: 'float32' });
    if (config.dataFormat && !/^channels_?last$/i.test(config.dataFormat)) {
      throw new Error(`Unsupported data format ${config.dataFormat}`);
    }
    this.spec = config;
  }

  override build(): void {
    this.magScale = this.addWeight(
      'magnitude_scaling',
      [],
      'float32',
      tfl.initializers.constant({ value: 1.23 }),
    );
    const { frameLength, melFilterbank } = this.spec;
    this.kernel = tf.keep(
      tf.tensor3d(melKernel(frameLength, melFilterbank), [frameLength, 1, melFilterbank[0].length]),
    );
    this.built = true;
  }

  override computeOutputShape(inputShape: tfl.Shape | tfl.Shape[]): tfl.Shape {
    const shape = (Array.isArray(inputShape[0]) ? inputShape[0] : inputShape) as tfl.Shape;
    const { frameLength, frameStep, melFilterbank } = this.spec;
    const samples = shape[1] ?? BIRDNET_V24.windowSamples;
    return [shape[0], melFilterbank[0].length, frameCount(samples, frameLength, frameStep), 1];
  }

  override call(inputs: tf.Tensor | tf.Tensor[]): tf.Tensor {
    return tf.tidy(() => {
      const x = (Array.isArray(inputs) ? inputs[0] : inputs) as tf.Tensor2D;
      // Scale each window to [-1, 1].
      const shifted = tf.sub(x, tf.min(x, 1, true));
      const scaled = tf.mul(
        tf.sub(tf.div(shifted, tf.add(tf.max(shifted, 1, true), 1e-6)), 0.5),
        2,
      );
      // Windowed real DFT + mel projection as one strided convolution → [batch, frames, mels].
      const mel = tf.conv1d(
        tf.expandDims(scaled, -1) as tf.Tensor3D,
        this.kernel!,
        this.spec.frameStep,
        'valid',
      );
      const power = tf.square(mel);
      const exponent = tf.div(1, tf.add(1, tf.exp(this.magScale!.read())));
      const spec = tf.pow(power, exponent);
      // Highest band first, then [batch, mels, frames, 1].
      return tf.expandDims(tf.transpose(tf.reverse(spec, -1), [0, 2, 1]), -1);
    });
  }

  override getConfig(): tf.serialization.ConfigDict {
    const { frameLength, frameStep, specShape, melFilterbank, sampleRate, fmin, fmax } = this.spec;
    return {
      ...super.getConfig(),
      frameLength,
      frameStep,
      specShape,
      melFilterbank,
      ...(sampleRate !== undefined && { sampleRate }),
      ...(fmin !== undefined && { fmin }),
      ...(fmax !== undefined && { fmax }),
    };
  }

  override dispose(): ReturnType<tfl.layers.Layer['dispose']> {
    this.kernel?.dispose();
    return super.dispose();
  }
}
tf.serialization.registerClass(MelSpecLayerSimple);

async function pickBackend(): Promise<string> {
  try {
    if (await tf.setBackend('webgl')) {
      await tf.ready();
      if (tf.env().getBool('WEBGL_RENDER_FLOAT32_CAPABLE')) return 'webgl';
    }
  } catch {
    /* no WebGL in this worker (e.g. no OffscreenCanvas): use WASM */
  }
  if (await tf.setBackend('wasm')) {
    await tf.ready();
    return 'wasm';
  }
  throw new Error('Neither WebGL nor WebAssembly is available for BirdNET.');
}

/** Reads model files from the dedicated cache only; the worker never downloads anything. */
async function cachedFetch(): Promise<(input: RequestInfo | URL) => Promise<Response>> {
  const cache = await caches.open(BIRDNET_CACHE);
  const marker = await cache.match(cacheKey(COMPLETE_MARKER));
  // A download made for an older file set (e.g. the previous location model) isn't used.
  const revision = marker
    ? (((await marker.json().catch(() => ({}))) as { revision?: number }).revision ?? 1)
    : 0;
  if (revision !== BIRDNET_MODEL_REVISION) throw new ModelNotDownloadedError();
  return async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const hit = await cache.match(url);
    if (!hit) throw new ModelNotDownloadedError();
    return hit;
  };
}

export async function loadTfModel(): Promise<BirdnetModel> {
  const started = performance.now();
  const fetchFunc = await cachedFetch();
  const backend = await pickBackend();
  const labels = parseLabels(await (await fetchFunc(cacheKey(LABELS_FILE))).text());
  const [acoustic, area] = await Promise.all([
    tfl.loadLayersModel(cacheKey(ACOUSTIC_MODEL), { fetchFunc }),
    loadGraphModel(cacheKey(LOCATION_MODEL), { fetchFunc }),
  ]);
  const classes = labels.length;
  const { windowSamples } = BIRDNET_V24;

  const geo = async (latitude: number, longitude: number, week?: number) => {
    const input = tf.tensor2d(geoInput(latitude, longitude, week), [1, 3]);
    const output = area.predict(input) as tf.Tensor;
    try {
      return (await output.data()) as Float32Array;
    } finally {
      input.dispose();
      output.dispose();
    }
  };

  // Every call runs a full batch (short ones zero-padded), so the model only ever sees one
  // input shape and the WebGL shaders compiled at warm-up are reused.
  const predict = async (batch: Float32Array, windows: number): Promise<Float32Array[]> => {
    const size = Math.max(windows, BATCH_WINDOWS);
    const data = windows === size ? batch : new Float32Array(size * windowSamples);
    if (data !== batch) data.set(batch.subarray(0, windows * windowSamples));
    const input = tf.tensor2d(data, [size, windowSamples]);
    const output = acoustic.predict(input) as tf.Tensor;
    try {
      const flat = (await output.data()) as Float32Array;
      if (flat.length !== size * classes) throw new Error('Unexpected model output size.');
      return Array.from({ length: windows }, (_, i) => flat.slice(i * classes, (i + 1) * classes));
    } finally {
      input.dispose();
      output.dispose();
    }
  };

  // Compile the shaders now, so the first real identification isn't slow.
  const loaded = performance.now();
  await predict(new Float32Array(windowSamples), 1);
  await geo(0, 0);
  console.debug(
    `BirdNET ${backend}: models loaded in ${Math.round(loaded - started)} ms, warmed up in ${Math.round(performance.now() - loaded)} ms`,
  );

  return { backend, labels, predict, geo };
}
