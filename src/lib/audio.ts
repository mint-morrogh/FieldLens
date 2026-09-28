/**
 * Audio helpers for Calls. Recordings are decoded on the device and re-encoded as
 * mono 16-bit WAV at BirdNET's sample rate, so the server never has to handle the
 * browser's own formats (AAC on iOS, Opus elsewhere) and no container metadata is sent.
 */

/** BirdNET analyses 48 kHz audio. */
export const CALL_SAMPLE_RATE = 48_000;

type AudioContextCtor = typeof AudioContext;
function audioContextCtor(): AudioContextCtor | undefined {
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  );
}

export function canRecordAudio(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined' &&
    !!audioContextCtor()
  );
}

export function newAudioContext(): AudioContext {
  const Ctor = audioContextCtor();
  if (!Ctor) throw new Error('Web Audio is not available');
  return new Ctor();
}

/** Mono 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Decodes a MediaRecorder clip and resamples it to mono WAV at `CALL_SAMPLE_RATE`. */
export async function toCallWav(recording: Blob, maxSeconds: number): Promise<Blob> {
  const ctx = newAudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await recording.arrayBuffer());
    const seconds = Math.min(decoded.duration, maxSeconds);
    const offline = new OfflineAudioContext(
      1,
      Math.max(1, Math.round(seconds * CALL_SAMPLE_RATE)),
      CALL_SAMPLE_RATE,
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0), CALL_SAMPLE_RATE);
  } finally {
    void ctx.close();
  }
}
