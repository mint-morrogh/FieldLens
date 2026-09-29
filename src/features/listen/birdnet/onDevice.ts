/**
 * The Listen screen's entry point for on-device identification. Returns BirdNET's result in
 * the wire shape `/api/identify` accepts (so the server can enrich it), or undefined when the
 * setting is off, the model isn't downloaded, or it fails; the caller then sends the
 * recording to the Space as before.
 */
import { CANDIDATES } from '../../../../shared/config';
import type { OnDeviceCall } from '../../../../shared/onDeviceCall';
import { CALL_SAMPLE_RATE } from '../../../lib/audio';
import { getSetting } from '../../../lib/settings';
import { birdnetClient } from './client';
import { isModelReady } from './modelStore';
import type { OnDeviceIdentification } from './protocol';

/** Whether calls should be identified on this device right now. */
export async function onDeviceEnabled(): Promise<boolean> {
  return getSetting('onDeviceCalls') && (await isModelReady());
}

/** Starts the worker and loads the model in the background, e.g. while recording. */
export function prewarmOnDevice(): void {
  void onDeviceEnabled().then((on) => {
    if (on)
      birdnetClient()
        .load()
        .catch(() => undefined);
  });
}

export function toOnDeviceCall(result: OnDeviceIdentification): OnDeviceCall {
  return {
    model: 'birdnet-v2.4-tfjs',
    seconds: result.seconds,
    results: result.results.map(({ name, common, score, mean, segments, of }) => ({
      name,
      common,
      score,
      mean,
      segments,
      of,
    })),
    sound: result.sound,
  };
}

export async function identifyOnDevice(
  samples: Float32Array,
  context: { location?: { latitude: number; longitude: number }; capturedAt: Date },
): Promise<OnDeviceCall | undefined> {
  if (!(await onDeviceEnabled())) return undefined;
  try {
    const result = await birdnetClient().identify(samples, {
      sampleRate: CALL_SAMPLE_RATE,
      location: context.location,
      capturedAt: context.capturedAt,
      k: CANDIDATES.maxCandidates,
    });
    return toOnDeviceCall(result);
  } catch (e) {
    console.warn('On-device BirdNET failed; identifying online instead.', e);
    return undefined;
  }
}
