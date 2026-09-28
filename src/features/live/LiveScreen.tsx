import type { ObjectDetector } from '@mediapipe/tasks-vision';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCategory } from '../../../shared/categories';
import { formatPercent } from '../../../shared/confidence';
import type { IdentifyResponse } from '../../../shared/types';
import { navigate } from '../../app/router';
import { Icon } from '../../components/Icon';
import { ClientError, identify } from '../../lib/api';
import { displayName } from '../../lib/format';
import { useSession } from '../identification/SessionContext';
import { useLocationState } from '../location/LocationContext';
import { mergeImages } from '../results/Gallery';

/**
 * Live identify: an on-device detector (MediaPipe EfficientDet-Lite0, COCO classes) boxes
 * animals and potted plants in the camera feed; anything else is framed by a centre box.
 * Scanning is automatic: when the view holds still, that frame is cropped to the box and
 * sent through the normal identification, and the match appears in a card over the camera.
 * Only still frames leave the phone, and only a few per session, so the free identification
 * quotas aren't burned by video.
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
/** Frames sent per live session, to protect the free identification quotas. */
const MAX_ATTEMPTS = 12;
const COOLDOWN_MS = 2500;
/**
 * A match is only shown once this many frames in a row agree on the species, so one odd
 * frame can't produce a confident-looking card. The follow-up frame is taken sooner.
 */
const VOTES_NEEDED = 2;
const CONFIRM_COOLDOWN_MS = 500;

type Rect = { x: number; y: number; w: number; h: number };
type Status =
  | 'starting'
  | 'aim'
  | 'steady'
  | 'analysing'
  | 'confirming'
  | 'found'
  | 'person'
  | 'exhausted'
  | 'error';
type Found = { result: IdentifyResponse; frame: Blob; crop: Blob };

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

const GLASS = 'border border-white/15 bg-black/35 backdrop-blur-xl backdrop-saturate-150';

/** The match, shown in a frosted card over the camera. */
function FoundCard({
  found,
  onClear,
  onDetails,
}: {
  found: Found;
  onClear: () => void;
  onDetails: () => void;
}) {
  const { result } = found;
  const top = result.candidates[0];
  const images = mergeImages(top.referenceImages, result.speciesInfo?.images).slice(0, 3);
  const band = result.confidenceBand === 'high' ? 'Very likely' : 'Likely';
  return (
    <div className={`live-card rounded-[1.75rem] p-4 ${GLASS}`} data-testid="live-result">
      <p className="readout text-[0.62rem] text-white/60">
        {getCategory(result.category).label} · {band} · {formatPercent(top.finalConfidence)}
      </p>
      <p className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-white">
        {displayName(top)}
      </p>
      {top.commonName && <p className="sci text-white/70">{top.scientificName}</p>}
      {images.length > 0 && (
        <ul className="mt-3 flex gap-2" aria-label={`What ${displayName(top)} looks like`}>
          {images.map((img) => (
            <li key={img.url} className="w-[calc((100%-1rem)/3)] max-w-24 shrink-0">
              <img
                src={img.thumbnailUrl ?? img.url}
                alt=""
                className="aspect-square w-full rounded-2xl object-cover"
              />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onClear}
          className="min-h-12 rounded-2xl bg-white/15 font-semibold text-white active:bg-white/25"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onDetails}
          className="min-h-12 rounded-2xl bg-white font-semibold text-black active:bg-white/80"
        >
          Details
        </button>
      </div>
    </div>
  );
}

export function LiveScreen() {
  const session = useSession();
  const { current } = useLocationState();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>('starting');
  const [error, setError] = useState<string>();
  /** Focus box, as fractions of the displayed (object-cover) video. */
  const [box, setBox] = useState<Rect>();
  /** What kind of organism it looks like ("Plant", "Mammal"…), then a first guess at the name. */
  const [kind, setKind] = useState<string>();
  const [guess, setGuess] = useState<string>();
  const [found, setFound] = useState<Found>();

  // Mutable loop state (read inside the interval without re-subscribing).
  const loop = useRef({
    detector: undefined as ObjectDetector | undefined,
    focus: undefined as Rect | undefined,
    focusIsPerson: false,
    lastLuma: undefined as Uint8ClampedArray | undefined,
    stillSince: 0,
    busy: false,
    /** A result card is showing: scanning waits until it's cleared. */
    paused: false,
    /** Frames agreeing so far on one species, and the most confident of them. */
    vote: undefined as { name: string; count: number; best: Found } | undefined,
    attempts: 0,
    nextAttemptAt: 0,
    done: false,
  });

  const openDetails = useCallback(
    ({ result, frame, crop }: Found) => {
      loop.current.done = true;
      session.adoptResult(
        {
          id: newId(),
          blob: crop,
          url: URL.createObjectURL(crop),
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

  const clear = useCallback(() => {
    const l = loop.current;
    setFound(undefined);
    setKind(undefined);
    setGuess(undefined);
    l.paused = false;
    l.vote = undefined;
    l.stillSince = 0;
    l.nextAttemptAt = performance.now() + 800;
    setStatus(l.attempts >= MAX_ATTEMPTS ? 'exhausted' : 'aim');
  }, []);

  const analyse = useCallback(async () => {
    const video = videoRef.current;
    const l = loop.current;
    if (!video || !l.focus || l.busy || l.done || l.paused) return;
    l.busy = true;
    l.attempts += 1;
    setStatus('analysing');
    setKind(undefined);
    setGuess(undefined);
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
            if (event.detected) {
              setKind(event.detected === 'person' ? 'Person' : getCategory(event.detected).label);
            }
            const top = event.preview?.[0];
            if (top) setGuess(displayName(top));
          },
        },
      );
      if (l.done) return;
      const top = result.candidates[0];
      if (result.person) {
        setStatus('person');
        setKind('Person');
      } else if (top && result.confidenceBand !== 'low' && result.confidenceBand !== 'none') {
        const name = top.scientificName.toLowerCase();
        const current: Found = { result, frame, crop };
        const agrees = l.vote?.name === name;
        const count = agrees ? l.vote!.count + 1 : 1;
        const best =
          agrees && l.vote!.best.result.candidates[0].finalConfidence >= top.finalConfidence
            ? l.vote!.best
            : current;
        setKind(getCategory(result.category).label);
        if (count >= VOTES_NEEDED) {
          l.vote = undefined;
          l.paused = true;
          setFound(best);
          setStatus('found');
        } else {
          // First sighting of this species: check another frame before showing it.
          l.vote = { name, count, best };
          setGuess(displayName(top));
          setStatus(l.attempts >= MAX_ATTEMPTS ? 'exhausted' : 'confirming');
        }
      } else {
        l.vote = undefined;
        setGuess(undefined);
        setStatus(l.attempts >= MAX_ATTEMPTS ? 'exhausted' : 'aim');
      }
    } catch (e) {
      setStatus('error');
      setError(e instanceof ClientError ? e.message : 'Live identification failed.');
    } finally {
      l.busy = false;
      l.nextAttemptAt = performance.now() + (l.vote ? CONFIRM_COOLDOWN_MS : COOLDOWN_MS);
      l.stillSince = 0;
    }
  }, [current]);

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
    const t = setInterval(() => {
      const video = videoRef.current;
      const l = loop.current;
      if (
        !video ||
        video.readyState < 2 ||
        l.done ||
        l.paused ||
        document.visibilityState !== 'visible'
      )
        return;
      const now = performance.now();
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // 1. Where to look: the most prominent living thing, else the centre.
      let focus = centreBox(vw, vh);
      let subject: string | undefined;
      if (l.detector) {
        const best = l.detector
          .detectForVideo(video, now)
          .detections.map((d) => ({ b: d.boundingBox, c: d.categories[0] }))
          .filter(({ b, c }) => b && c && LIVING.has(c.categoryName))
          .map(({ b, c }) => ({
            rect: { x: b!.originX, y: b!.originY, w: b!.width, h: b!.height },
            c,
          }))
          .sort((a, b) => b.rect.w * b.rect.h * b.c.score - a.rect.w * a.rect.h * a.c.score)[0];
        if (best) {
          focus = best.rect;
          subject = best.c.categoryName;
        }
      }
      l.focus = focus;
      l.focusIsPerson = subject === 'person';
      setBox({ x: focus.x / vw, y: focus.y / vh, w: focus.w / vw, h: focus.h / vh });

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
      else {
        l.stillSince = 0;
        // A big move means a different subject: start the vote again.
        if (motion > MOTION_THRESHOLD * 3 && l.vote && !l.busy) {
          l.vote = undefined;
          setStatus((st) => (st === 'confirming' ? 'aim' : st));
        }
      }

      // 3. People are recognised on the device; no need to send them anywhere.
      if (l.focusIsPerson && !l.busy) {
        setStatus('person');
        setKind('Person');
        return;
      }
      if (l.busy || l.attempts >= MAX_ATTEMPTS || now < l.nextAttemptAt) return;
      const still = l.stillSince && now - l.stillSince;
      setStatus((s) =>
        s === 'error' || s === 'exhausted' || s === 'confirming'
          ? s
          : still
            ? 'steady'
            : s === 'person'
              ? 'aim'
              : s,
      );
      if (still && still >= STILL_FOR_MS) void analyse();
    }, TICK_MS);
    return () => clearInterval(t);
  }, [analyse]);

  const message: Partial<Record<Status, string>> = {
    starting: 'Starting camera',
    aim: 'Point at a plant, animal or mushroom',
    steady: 'Hold steady',
    analysing: guess ? `${guess}…` : kind ? `Looks like a ${kind.toLowerCase()}…` : 'Identifying…',
    confirming: guess ? `${guess}? Checking again…` : 'Checking again…',
    person: 'That’s a person. Point at something wild',
    exhausted: 'Scan limit reached for this session',
    error: error ?? 'Something went wrong',
  };
  const scanning = status === 'analysing' || status === 'confirming';

  return (
    <div
      className="fixed inset-0 z-40 overflow-hidden bg-black text-white"
      role="dialog"
      aria-label="Live identify"
      data-testid="live-screen"
    >
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
        aria-label="Camera view"
      />

      {box && status !== 'error' && !found && (
        <div
          className={`live-focus absolute ${scanning ? 'live-focus-scanning' : ''}`}
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.w * 100}%`,
            height: `${box.h * 100}%`,
          }}
          data-testid="live-box"
          aria-hidden
        >
          {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
            <span key={c} className={`live-corner live-corner-${c}`} />
          ))}
          {kind && (
            <span
              className={`fade-up absolute -top-9 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${GLASS}`}
              data-testid="live-kind"
            >
              {kind}
            </span>
          )}
        </div>
      )}

      {/* Top bar */}
      <div className="safe-top absolute inset-x-0 top-0 flex items-center justify-between px-4">
        <button
          type="button"
          onClick={() => navigate({ name: 'home' }, { replace: true })}
          className={`flex h-11 w-11 items-center justify-center rounded-full ${GLASS}`}
          aria-label="Close live identify"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
        <span
          className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold ${GLASS}`}
        >
          <span className="live-dot h-2 w-2 rounded-full bg-[#ff5a3c]" />
          Live
        </span>
        <span className="w-11" aria-hidden />
      </div>

      {/* Bottom: status pill, or the match card */}
      <div className="safe-bottom absolute inset-x-0 bottom-0 px-4">
        {found ? (
          <FoundCard found={found} onClear={clear} onDetails={() => openDetails(found)} />
        ) : (
          <div className="flex flex-col items-center gap-3 pb-2">
            <p
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-[0.95rem] font-medium ${GLASS}`}
              role="status"
              data-testid="live-status"
            >
              {scanning && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" />
              )}
              {message[status]}
            </p>
            {(status === 'error' || status === 'exhausted') && (
              <button
                type="button"
                onClick={() => navigate({ name: 'home' }, { replace: true })}
                className="min-h-12 rounded-2xl bg-white px-5 font-semibold text-black"
              >
                Take a photo instead
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
