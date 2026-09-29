import { useCallback, useEffect, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import { Icon } from '../../components/Icon';
import { ClientError, identify } from '../../lib/api';
import {
  CALL_SAMPLE_RATE,
  canRecordAudio,
  encodeWav,
  newAudioContext,
  toCallSamples,
} from '../../lib/audio';
import { displayName } from '../../lib/format';
import { newId } from '../../lib/ids';
import { useSession } from '../identification/SessionContext';
import { useLocationState } from '../location/LocationContext';
import { stopBirdnet } from './birdnet/client';
import { identifyOnDevice, prewarmOnDevice } from './birdnet/onDevice';

/**
 * Calls: records a few seconds of birdsong and identifies it with BirdNET.
 * The clip is decoded on the device and sent once as a short mono WAV. It's never stored:
 * history keeps the spectrogram drawn while listening, as the "photo" for that find.
 * With "Identify bird calls on this device" on and the model downloaded, BirdNET runs here
 * instead and only its result is sent (for names, ranges and facts); if it can't run, the
 * recording goes to the Space as usual.
 */
export const MIN_SECONDS = 3;
export const MAX_SECONDS = 15;
/** Birdsong sits below ~11 kHz; the spectrogram shows 0 to this frequency. */
const TOP_HZ = 11_000;

type Status = 'idle' | 'starting' | 'listening' | 'analysing' | 'error';

const GLASS = 'border border-white/15 bg-black/35 backdrop-blur-xl backdrop-saturate-150';

function recorderMimeType(): string | undefined {
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(
    (t) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t),
  );
}

/** Spectrogram colour: dark moss to pale gold, readable on the black panel. */
function heat(v: number): string {
  const t = Math.min(1, Math.max(0, (v - 40) / 180));
  const r = Math.round(20 + 225 * t);
  const g = Math.round(28 + 200 * t ** 0.8);
  const b = Math.round(24 + 110 * t ** 2);
  return `rgb(${r},${g},${b})`;
}

export function ListenScreen() {
  const session = useSession();
  const { current } = useLocationState();
  const [status, setStatus] = useState<Status>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string>();
  const [guess, setGuess] = useState<string>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rec = useRef<{
    stream?: MediaStream;
    recorder?: MediaRecorder;
    ctx?: AudioContext;
    raf?: number;
    timer?: ReturnType<typeof setInterval>;
    startedAt?: number;
    chunks: Blob[];
    cancelled: boolean;
  }>({ chunks: [], cancelled: false });
  const supported = canRecordAudio();

  const teardown = useCallback(() => {
    const r = rec.current;
    if (r.raf) cancelAnimationFrame(r.raf);
    if (r.timer) clearInterval(r.timer);
    r.stream?.getTracks().forEach((t) => t.stop());
    void r.ctx?.close().catch(() => undefined);
    r.raf = r.timer = r.stream = r.ctx = undefined;
  }, []);

  useEffect(() => {
    // Load the on-device model (if it's in use) while the user records.
    prewarmOnDevice();
    const r = rec.current;
    // React's development double mount runs the cleanup once before the real mount.
    r.cancelled = false;
    return () => {
      r.cancelled = true;
      if (r.recorder?.state === 'recording') r.recorder.stop();
      teardown();
      // Frees the model's memory; it reloads from the cache next time.
      stopBirdnet();
    };
  }, [teardown]);

  /** Scrolls the spectrogram one column per frame from the analyser. */
  const draw = useCallback((analyser: AnalyserNode, sampleRate: number) => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const bins = new Uint8Array(analyser.frequencyBinCount);
    const topBin = Math.min(bins.length, Math.ceil((TOP_HZ / (sampleRate / 2)) * bins.length));
    const step = () => {
      analyser.getByteFrequencyData(bins);
      const w = canvas.width;
      const h = canvas.height;
      g.drawImage(canvas, -2, 0);
      for (let y = 0; y < h; y++) {
        const bin = Math.floor(((h - 1 - y) / h) * topBin);
        g.fillStyle = heat(bins[bin]);
        g.fillRect(w - 2, y, 2, 1);
      }
      rec.current.raf = requestAnimationFrame(step);
    };
    rec.current.raf = requestAnimationFrame(step);
  }, []);

  const analyse = useCallback(
    async (clip: Blob) => {
      setStatus('analysing');
      try {
        const [samples, location, spectrogram] = await Promise.all([
          toCallSamples(clip, MAX_SECONDS),
          current().catch(() => undefined),
          new Promise<Blob | null>((resolve) =>
            canvasRef.current
              ? canvasRef.current.toBlob(resolve, 'image/jpeg', 0.9)
              : resolve(null),
          ),
        ]);
        const capturedAt = new Date();
        const birdnet = await identifyOnDevice(samples, { location, capturedAt });
        const heard = birdnet?.results[0];
        if (heard) setGuess(heard.common || heard.name);
        const result = await identify(
          {
            observationId: newId(),
            category: 'bird',
            images: [],
            ...(birdnet ? { birdnet } : { audio: encodeWav(samples, CALL_SAMPLE_RATE) }),
            location,
            capturedAt,
            timeSource: 'device',
          },
          {
            onStage: (event) => {
              const top = event.preview?.[0];
              if (top) setGuess(displayName(top));
            },
          },
        ).catch((e: unknown) => {
          // Offline, the on-device answer is still worth showing, even without the details.
          if (heard && e instanceof ClientError && (e.code === 'offline' || e.code === 'network')) {
            throw new ClientError(
              e.code,
              `On this device it sounds like ${heard.common || heard.name}. Connect to the internet to see the full result.`,
            );
          }
          throw e;
        });
        if (rec.current.cancelled) return;
        const image = spectrogram ?? new Blob([], { type: 'image/jpeg' });
        session.adoptResult(
          { id: newId(), blob: image, url: URL.createObjectURL(image), feature: 'call' },
          result,
          capturedAt,
        );
        navigate({ name: 'identify' }, { replace: true });
      } catch (e) {
        setStatus('error');
        setError(e instanceof ClientError ? e.message : 'We couldn’t analyse that recording.');
      }
    },
    [current, session],
  );

  const stop = useCallback(() => {
    const r = rec.current;
    if (r.recorder?.state === 'recording') r.recorder.stop();
  }, []);

  const start = useCallback(async () => {
    setError(undefined);
    setGuess(undefined);
    setSeconds(0);
    setStatus('starting');
    const r = rec.current;
    r.chunks = [];
    try {
      // Phone voice processing (echo cancellation, noise suppression) strips birdsong.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      r.stream = stream;
      const ctx = newAudioContext();
      r.ctx = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.2;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const mimeType = recorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      r.recorder = recorder;
      recorder.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
      recorder.onstop = () => {
        const elapsed = (performance.now() - (r.startedAt ?? 0)) / 1000;
        teardown();
        if (r.cancelled) return;
        if (elapsed < MIN_SECONDS) {
          setStatus('idle');
          setError(`Record at least ${MIN_SECONDS} seconds.`);
          return;
        }
        void analyse(new Blob(r.chunks, { type: recorder.mimeType || mimeType }));
      };
      recorder.start(250);
      r.startedAt = performance.now();
      r.timer = setInterval(() => {
        const s = (performance.now() - (r.startedAt ?? 0)) / 1000;
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 200);
      draw(analyser, ctx.sampleRate);
      setStatus('listening');
    } catch (e) {
      teardown();
      setStatus('error');
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it in your browser settings to identify calls.'
          : 'The microphone couldn’t be started.',
      );
    }
  }, [analyse, draw, stop, teardown]);

  const listening = status === 'listening';
  const message: Record<Status, string> = {
    idle: 'Tap to listen for a bird',
    starting: 'Starting the microphone…',
    listening:
      seconds < MIN_SECONDS
        ? 'Listening…'
        : `Listening… tap to identify (${Math.floor(seconds)} s)`,
    analysing: guess ? `Sounds like ${guess}…` : 'Analysing the call…',
    error: error ?? 'Something went wrong',
  };

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-black text-white"
      role="dialog"
      aria-label="Identify a call"
      data-testid="listen-screen"
    >
      <div className="safe-top flex items-center justify-between px-4">
        <button
          type="button"
          onClick={() => navigate({ name: 'home' }, { replace: true })}
          className={`flex h-11 w-11 items-center justify-center rounded-full ${GLASS}`}
          aria-label="Close calls"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
        <span
          className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold ${GLASS}`}
        >
          {listening && <span className="live-dot h-2 w-2 rounded-full bg-[#ff5a3c]" />}
          Calls
        </span>
        <span className="w-11" aria-hidden />
      </div>

      <div className="relative mx-4 mt-6 flex-1 overflow-hidden rounded-3xl border border-white/10 bg-[#0d120f]">
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          className="absolute inset-0 h-full w-full"
          aria-label="Spectrogram of the sound being recorded"
          data-testid="listen-spectrogram"
        />
        <div className="pointer-events-none absolute inset-y-0 left-3 flex flex-col justify-between py-3 font-mono text-[0.7rem] text-white/45">
          <span>11 kHz</span>
          <span>5 kHz</span>
          <span>0</span>
        </div>
        {status === 'idle' && !error && (
          <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-white/60 [text-wrap:balance]">
            Point your phone toward the song and keep still and quiet. Up to {MAX_SECONDS} seconds.
          </p>
        )}
        {listening && (
          <div
            className="absolute inset-x-0 bottom-0 h-1 bg-[#ff5a3c]"
            style={{
              transform: `scaleX(${Math.min(1, seconds / MAX_SECONDS)})`,
              transformOrigin: 'left',
            }}
            aria-hidden
          />
        )}
      </div>

      <div className="safe-bottom flex flex-col items-center gap-4 px-4 pb-4 pt-6">
        <p
          className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-[0.95rem] font-medium ${GLASS}`}
          role="status"
          data-testid="listen-status"
        >
          {(status === 'analysing' || status === 'starting') && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" />
          )}
          {supported ? message[status] : 'This browser can’t record audio.'}
        </p>
        {supported && status !== 'analysing' && status !== 'starting' && (
          <button
            type="button"
            onClick={listening ? stop : start}
            disabled={listening && seconds < MIN_SECONDS}
            className={`flex h-20 w-20 items-center justify-center rounded-full border-4 transition disabled:opacity-60 ${
              listening ? 'border-[#ff5a3c] bg-[#ff5a3c]/20' : 'border-white bg-white/10'
            }`}
            aria-label={listening ? 'Stop and identify' : 'Start listening'}
            data-testid="listen-button"
          >
            <Icon name={listening ? 'stop' : 'mic'} className="h-8 w-8" />
          </button>
        )}
      </div>
    </div>
  );
}
