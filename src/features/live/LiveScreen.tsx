import type { ObjectDetector } from '@mediapipe/tasks-vision';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatPercent } from '../../../shared/confidence';
import type { IdentifyResponse } from '../../../shared/types';
import { navigate } from '../../app/router';
import { Icon } from '../../components/Icon';
import { ClientError, identify } from '../../lib/api';
import { displayName } from '../../lib/format';
import { useSession } from '../identification/SessionContext';
import { useLocationState } from '../location/LocationContext';

/**
 * Live identify: an on-device detector (MediaPipe EfficientDet-Lite0, COCO classes) boxes
 * animals and potted plants in the camera feed; anything else is framed by a centre box.
 * When the view holds still, that frame is cropped to the box and sent through the normal
 * identification. Only still frames leave the phone, and only a few per session, so the
 * free identification quotas aren't burned by video.
 */
const MEDIAPIPE_VERSION = '1.0.1';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
/** COCO classes worth boxing; everything else (cars, chairs…) is ignored. */
const LIVING = new Set([
  'person',
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
  'potted plant',
]);
const TICK_MS = 100;
const STILL_FOR_MS = 900;
const MOTION_THRESHOLD = 7;
const MAX_ATTEMPTS = 4;
const COOLDOWN_MS = 2500;
const CONFIRM_DELAY_MS = 1100;

type Rect = { x: number; y: number; w: number; h: number };
type Status =
  'starting' | 'aim' | 'steady' | 'analysing' | 'confirmed' | 'person' | 'exhausted' | 'error';

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Centre square covering 60% of the shorter side of the frame. */
function centreBox(vw: number, vh: number): Rect {
  const side = Math.min(vw, vh) * 0.6;
  return { x: (vw - side) / 2, y: (vh - side) / 2, w: side, h: side };
}

function toBlob(canvas: HTMLCanvasElement, quality = 0.88): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality),
  );
}

/** Draw part of the video to a JPEG no larger than `maxEdge` on its long side. */
async function grab(video: HTMLVideoElement, r: Rect, maxEdge: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(r.w, r.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(r.w * scale);
  canvas.height = Math.round(r.h * scale);
  canvas.getContext('2d')!.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
  return toBlob(canvas);
}

export function LiveScreen() {
  const session = useSession();
  const { current } = useLocationState();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>('starting');
  const [error, setError] = useState<string>();
  /** Focus box, as fractions of the displayed (object-cover) video. */
  const [box, setBox] = useState<Rect>();
  const [subject, setSubject] = useState<string>();
  const [label, setLabel] = useState<string>();
  const [best, setBest] = useState<{ result: IdentifyResponse; frame: Blob; crop: Blob }>();
  const [attempts, setAttempts] = useState(0);
  const [fps, setFps] = useState(0);

  // Mutable loop state (read inside the interval without re-subscribing).
  const loop = useRef({
    detector: undefined as ObjectDetector | undefined,
    focus: undefined as Rect | undefined,
    focusIsPerson: false,
    lastLuma: undefined as Uint8ClampedArray | undefined,
    stillSince: 0,
    busy: false,
    attempts: 0,
    nextAttemptAt: 0,
    done: false,
  });

  const finish = useCallback(
    (result: IdentifyResponse, frame: Blob, crop: Blob) => {
      loop.current.done = true;
      const url = URL.createObjectURL(crop);
      session.adoptResult(
        {
          id: newId(),
          blob: crop,
          url,
          feature: 'auto',
          original: { blob: frame, url: URL.createObjectURL(frame) },
        },
        result,
        new Date(),
      );
      navigate({ name: 'identify' }, { replace: true });
    },
    [session],
  );

  const analyse = useCallback(async () => {
    const video = videoRef.current;
    const l = loop.current;
    if (!video || !l.focus || l.busy || l.done) return;
    l.busy = true;
    l.attempts += 1;
    setAttempts(l.attempts);
    setStatus('analysing');
    setLabel(undefined);
    try {
      const pad = 0.15;
      const f = l.focus;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const x = Math.max(0, f.x - f.w * pad);
      const y = Math.max(0, f.y - f.h * pad);
      const region = {
        x,
        y,
        w: Math.min(vw - x, f.w * (1 + 2 * pad)),
        h: Math.min(vh - y, f.h * (1 + 2 * pad)),
      };
      const [crop, frame] = await Promise.all([
        grab(video, region, 1280),
        grab(video, { x: 0, y: 0, w: vw, h: vh }, 2048),
      ]);
      const location = await current().catch(() => undefined);
      const result = await identify(
        {
          observationId: newId(),
          category: 'auto',
          images: [{ blob: crop, feature: 'auto' }],
          location,
          capturedAt: new Date(),
        },
        {
          onStage: (event) => {
            const top = event.preview?.[0];
            if (top) setLabel(`${displayName(top)} · ${formatPercent(top.visualConfidence)}`);
          },
        },
      );
      if (loop.current.done) return;
      const top = result.candidates[0];
      if (result.person) {
        setStatus('person');
        setLabel('Person');
      } else if (top && result.confidenceBand === 'high') {
        setStatus('confirmed');
        setLabel(`${displayName(top)} · ${formatPercent(top.finalConfidence)}`);
        setTimeout(() => finish(result, frame, crop), CONFIRM_DELAY_MS);
        return;
      } else if (top) {
        setLabel(`Maybe ${displayName(top)} · ${formatPercent(top.finalConfidence)}`);
        setBest((b) =>
          !b || top.finalConfidence > (b.result.candidates[0]?.finalConfidence ?? 0)
            ? { result, frame, crop }
            : b,
        );
        setStatus(l.attempts >= MAX_ATTEMPTS ? 'exhausted' : 'aim');
      } else {
        setLabel('No match yet');
        setStatus(l.attempts >= MAX_ATTEMPTS ? 'exhausted' : 'aim');
      }
    } catch (e) {
      setStatus('error');
      setError(e instanceof ClientError ? e.message : 'Live identification failed.');
    } finally {
      l.busy = false;
      l.nextAttemptAt = performance.now() + COOLDOWN_MS;
      l.stillSince = 0;
    }
  }, [current, finish]);

  // Camera + detector setup.
  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    const l = loop.current;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setStatus('aim');
      } catch (e) {
        setStatus('error');
        setError(
          e instanceof DOMException && e.name === 'NotAllowedError'
            ? 'Camera access is blocked. Allow the camera for this site, or take a photo instead.'
            : 'The camera isn’t available on this device.',
        );
        return;
      }
      // The detector is optional: without it, a centre box still works.
      try {
        const { FilesetResolver, ObjectDetector } = await import('@mediapipe/tasks-vision');
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const detector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          scoreThreshold: 0.4,
          maxResults: 5,
        });
        if (cancelled) detector.close();
        else l.detector = detector;
      } catch {
        /* keep the centre box */
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      l.detector?.close();
      l.detector = undefined;
    };
  }, []);

  // Detection, stillness and capture loop.
  useEffect(() => {
    const probe = document.createElement('canvas');
    probe.width = 32;
    probe.height = 24;
    const ctx = probe.getContext('2d', { willReadFrequently: true })!;
    let frames = 0;
    let fpsSince = performance.now();
    const t = setInterval(() => {
      const video = videoRef.current;
      const l = loop.current;
      if (!video || video.readyState < 2 || l.done || document.visibilityState !== 'visible')
        return;
      const now = performance.now();
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // 1. Where to look: the most prominent living thing, else the centre.
      let focus = centreBox(vw, vh);
      let found: string | undefined;
      if (l.detector) {
        const detections = l.detector.detectForVideo(video, now).detections;
        const scored = detections
          .map((d) => ({ d, c: d.categories[0] }))
          .filter(({ d, c }) => d.boundingBox && c && LIVING.has(c.categoryName))
          .map(({ d, c }) => {
            const b = d.boundingBox!;
            return { rect: { x: b.originX, y: b.originY, w: b.width, h: b.height }, c };
          })
          .sort((a, b) => b.rect.w * b.rect.h * b.c.score - a.rect.w * a.rect.h * a.c.score);
        if (scored[0]) {
          focus = scored[0].rect;
          found = scored[0].c.categoryName;
        }
        frames++;
      }
      l.focus = focus;
      l.focusIsPerson = found === 'person';
      setSubject(found);
      setBox({ x: focus.x / vw, y: focus.y / vh, w: focus.w / vw, h: focus.h / vh });
      if (now - fpsSince > 1000) {
        setFps(Math.round((frames * 1000) / (now - fpsSince)));
        frames = 0;
        fpsSince = now;
      }

      // 2. Is the view holding still?
      ctx.drawImage(video, 0, 0, probe.width, probe.height);
      const px = ctx.getImageData(0, 0, probe.width, probe.height).data;
      const luma = new Uint8ClampedArray(probe.width * probe.height);
      for (let i = 0; i < luma.length; i++)
        luma[i] = (px[i * 4] * 3 + px[i * 4 + 1] * 6 + px[i * 4 + 2]) / 10;
      let motion = 255;
      if (l.lastLuma) {
        let sum = 0;
        for (let i = 0; i < luma.length; i++) sum += Math.abs(luma[i] - l.lastLuma[i]);
        motion = sum / luma.length;
      }
      l.lastLuma = luma;
      if (motion < MOTION_THRESHOLD) l.stillSince ||= now;
      else l.stillSince = 0;

      // 3. People are recognised on the device; no need to send them anywhere.
      if (l.focusIsPerson && !l.busy) {
        setStatus('person');
        setLabel('Person');
        return;
      }
      if (l.busy || l.attempts >= MAX_ATTEMPTS || now < l.nextAttemptAt) return;
      const still = l.stillSince && now - l.stillSince;
      setStatus((s) =>
        s === 'error' || s === 'exhausted' ? s : still ? 'steady' : s === 'person' ? 'aim' : s,
      );
      if (still && still >= STILL_FOR_MS) void analyse();
    }, TICK_MS);
    return () => clearInterval(t);
  }, [analyse]);

  const message: Record<Status, string> = {
    starting: 'Starting the camera…',
    aim: 'Point at a plant, animal or mushroom',
    steady: 'Hold steady…',
    analysing: 'Analysing…',
    confirmed: 'Confirmed',
    person: 'That’s a person. Point at something wild',
    exhausted: 'Couldn’t confirm it. Try getting closer, or use the best match',
    error: error ?? 'Something went wrong',
  };
  const confirmed = status === 'confirmed';

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col bg-black text-white"
      role="dialog"
      aria-label="Live identify"
      data-testid="live-screen"
    >
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
          aria-label="Camera view"
        />
        {box && status !== 'error' && (
          <div
            className={`live-box absolute rounded-xl ${confirmed ? 'live-box-confirmed' : ''}`}
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
            }}
            data-testid="live-box"
            aria-hidden
          >
            {status === 'analysing' && <div className="live-box-scan" />}
            {label && (
              <span className="readout absolute -top-7 left-0 max-w-[80vw] truncate rounded-md bg-black/70 px-2 py-1 text-[0.68rem] normal-case tracking-normal text-[#d6f5c7]">
                {label}
              </span>
            )}
          </div>
        )}

        <div className="safe-top readout absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-3 pb-8 text-[0.65rem] text-white/75">
          <button
            type="button"
            onClick={() => navigate({ name: 'home' }, { replace: true })}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 normal-case"
            aria-label="Close live identify"
          >
            <Icon name="close" className="h-6 w-6" />
          </button>
          <span className="flex items-center gap-1.5">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#ee5b3b]" />
            Live
            {fps > 0 && <span className="text-white/45">· {fps} fps on device</span>}
          </span>
          <span className="w-11 text-right text-white/45">
            {attempts}/{MAX_ATTEMPTS}
          </span>
        </div>
      </div>

      <div className="safe-bottom space-y-3 bg-[#11140f] px-4 pt-4">
        <p className="text-center font-semibold" role="status" data-testid="live-status">
          {message[status]}
          {subject && subject !== 'person' && status === 'aim' ? ' · subject found' : ''}
        </p>
        <div className="flex items-center justify-center gap-3">
          {best && !confirmed && (
            <button
              type="button"
              onClick={() => finish(best.result, best.frame, best.crop)}
              className="min-h-12 rounded-2xl bg-white/10 px-4 font-semibold"
            >
              See best match
            </button>
          )}
          {!confirmed && status !== 'error' && attempts < MAX_ATTEMPTS && (
            <button
              type="button"
              onClick={() => void analyse()}
              disabled={status === 'analysing' || status === 'starting'}
              className="min-h-12 rounded-2xl bg-[#9fd08a] px-5 font-bold text-[#10180f] disabled:opacity-50"
            >
              Identify now
            </button>
          )}
          {(status === 'error' || status === 'exhausted') && (
            <button
              type="button"
              onClick={() => navigate({ name: 'home' }, { replace: true })}
              className="min-h-12 rounded-2xl bg-white/10 px-4 font-semibold"
            >
              Take a photo instead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
