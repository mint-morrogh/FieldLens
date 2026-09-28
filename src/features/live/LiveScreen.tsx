import type { ObjectDetector } from '@mediapipe/tasks-vision';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCategory } from '../../../shared/categories';
import { formatPercent } from '../../../shared/confidence';
import { UPLOAD } from '../../../shared/config';
import type {
  DecidingView,
  FeatureId,
  IdentifyResponse,
  IdentifyTarget,
} from '../../../shared/types';
import { navigate } from '../../app/router';
import { Icon } from '../../components/Icon';
import { ClientError, identify } from '../../lib/api';
import { displayName } from '../../lib/format';
import { currentTilt, startTiltTracking } from '../../lib/tilt';
import { useSetting } from '../../lib/settings';
import { useSession } from '../identification/SessionContext';
import { useLocationState } from '../location/LocationContext';
import { mergeImages } from '../results/Gallery';
import {
  framePolicy,
  lightLabel,
  smoothLatency,
  watchBattery,
  type FramePolicy,
} from './framePolicy';

/**
 * Live identify: an on-device detector (MediaPipe EfficientDet-Lite0, COCO classes) boxes
 * animals, potted plants and vases (bouquets) in the camera feed; anything else is framed by a
 * centre box. Scanning is automatic: when the view holds still, that frame is cropped to the box
 * and sent through the normal identification, and the match appears in a card over the camera.
 * Tapping the view identifies whatever is under the finger straight away, with a full-resolution
 * photo where the browser can take one. Only still frames leave the phone, and only a few per
 * session, so the free identification quotas aren't burned by video.
 */
const MEDIAPIPE_VERSION = '1.0.1';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
/**
 * COCO classes worth boxing, and what each says about the subject. The detector has no
 * "flower" class: a bouquet shows up as a vase. A hint skips server-side category detection
 * (faster, and it doesn't use the GPU quota); people are recognised here and never sent.
 */
type Hint = { category?: IdentifyTarget; label: string };
const MAMMAL: Hint = { category: 'mammal', label: 'Mammal' };
const HINTS: Record<string, Hint> = {
  person: { label: 'Person' },
  bird: { category: 'bird', label: 'Bird' },
  cat: MAMMAL,
  dog: MAMMAL,
  horse: MAMMAL,
  sheep: MAMMAL,
  cow: MAMMAL,
  elephant: MAMMAL,
  bear: MAMMAL,
  zebra: MAMMAL,
  giraffe: MAMMAL,
  'potted plant': { category: 'plant', label: 'Plant' },
  vase: { category: 'plant', label: 'Flowers' },
};
/**
 * The loop's tick, the frames sent per live session (scans and taps, to protect the free
 * identification quotas), the cooldown between scans and the upload size all come from
 * `framePolicy`: lighter on low battery, when the phone runs warm, and with data saver on.
 */
const STILL_FOR_MS = 900;
const MOTION_THRESHOLD = 7;
/**
 * An automatic match is only shown once this many frames in a row agree on the species, so one
 * odd frame can't produce a confident-looking card. The follow-up frame is taken sooner.
 * A tap shows its result straight away: the person has said what they mean.
 */
const VOTES_NEEDED = 2;
const CONFIRM_COOLDOWN_MS = 500;
/** A tap with no detector box around it identifies a square this share of the shorter side. */
const TAP_BOX = 0.45;
/** A boxed subject smaller than this share of the frame is too far away to identify well. */
const TOO_SMALL = 0.04;

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
type LiveCrop = { blob: Blob; feature: FeatureId };
/**
 * `crops` is set when several frames were identified together (the deciding angle), with
 * `previous` the result they were added to.
 */
type Found = {
  result: IdentifyResponse;
  frame: Blob;
  crop: Blob;
  crops?: LiveCrop[];
  previous?: IdentifyResponse;
};
/** The deciding angle being shot: the next frame is identified together with these crops. */
type Join = {
  crops: LiveCrop[];
  frame: Blob;
  category: IdentifyTarget;
  previous: IdentifyResponse;
  view: DecidingView;
};
type Focus = Rect & { hint?: Hint };
type Tip = 'several' | 'closer' | 'unsure' | undefined;

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
async function grab(
  video: HTMLVideoElement,
  r: Rect,
  maxEdge: number,
  quality?: number,
): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(r.w, r.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(r.w * scale);
  canvas.height = Math.round(r.h * scale);
  canvas.getContext('2d')!.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
  return toBlob(canvas, quality);
}

/** Where a video rectangle appears on screen, as fractions of the element (object-fit: cover). */
function toDisplay(video: HTMLVideoElement, r: Rect): Rect {
  const cw = video.clientWidth || 1;
  const ch = video.clientHeight || 1;
  const scale = Math.max(cw / video.videoWidth, ch / video.videoHeight);
  const ox = (cw - video.videoWidth * scale) / 2;
  const oy = (ch - video.videoHeight * scale) / 2;
  return {
    x: (r.x * scale + ox) / cw,
    y: (r.y * scale + oy) / ch,
    w: (r.w * scale) / cw,
    h: (r.h * scale) / ch,
  };
}

/** The video pixel under a screen point. */
function toVideo(video: HTMLVideoElement, clientX: number, clientY: number) {
  const b = video.getBoundingClientRect();
  const scale = Math.max(b.width / video.videoWidth, b.height / video.videoHeight);
  return {
    x: (clientX - b.left - (b.width - video.videoWidth * scale) / 2) / scale,
    y: (clientY - b.top - (b.height - video.videoHeight * scale) / 2) / scale,
  };
}

type ImageCaptureLike = { takePhoto(): Promise<Blob> };
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

/**
 * A full-resolution still from the live camera (Chrome on Android), cropped to the region.
 * The video is taken to be a centred crop of the photo's field of view. Returns undefined
 * where the browser can't (iOS Safari), so the caller falls back to the video frame.
 */
async function photoCrop(
  track: MediaStreamTrack | undefined,
  video: HTMLVideoElement,
  r: Rect,
  maxEdge: number,
  quality?: number,
): Promise<Blob | undefined> {
  const Ctor = (globalThis as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
  if (!track || !Ctor) return undefined;
  try {
    const blob = await Promise.race([
      new Ctor(track).takePhoto(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('slow')), 3000)),
    ]);
    const bitmap = await createImageBitmap(blob);
    const s = Math.min(bitmap.width / video.videoWidth, bitmap.height / video.videoHeight);
    const ox = (bitmap.width - video.videoWidth * s) / 2;
    const oy = (bitmap.height - video.videoHeight * s) / 2;
    const src = { x: r.x * s + ox, y: r.y * s + oy, w: r.w * s, h: r.h * s };
    const scale = Math.min(1, maxEdge / Math.max(src.w, src.h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(src.w * scale);
    canvas.height = Math.round(src.h * scale);
    canvas
      .getContext('2d')!
      .drawImage(bitmap, src.x, src.y, src.w, src.h, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await toBlob(canvas, quality);
  } catch {
    return undefined;
  }
}

const GLASS = 'border border-white/15 bg-black/35 backdrop-blur-xl backdrop-saturate-150';

/** The match, shown in a frosted card over the camera. */
function FoundCard({
  found,
  onClear,
  onDetails,
  onDecide,
}: {
  found: Found;
  onClear: () => void;
  onDetails: () => void;
  /** Shoot the deciding angle next (offered when the result names one). */
  onDecide?: (view: DecidingView) => void;
}) {
  const { result } = found;
  const top = result.candidates[0];
  const images = mergeImages(top.referenceImages, result.speciesInfo?.images).slice(0, 3);
  const band =
    result.confidenceBand === 'high'
      ? 'Very likely'
      : result.confidenceBand === 'medium'
        ? 'Likely'
        : 'Possible';
  return (
    <div className={`live-card rounded-[1.75rem] p-4 ${GLASS}`} data-testid="live-result">
      <p className="readout text-[0.62rem] text-white/60">
        {getCategory(result.category).label} ·{' '}
        <span className={result.confidenceBand === 'low' ? 'text-[#f5c26b]' : undefined}>
          {band}
        </span>{' '}
        · {formatPercent(top.finalConfidence)}
      </p>
      <p className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-white">
        {result.confidenceBand === 'low' ? `${displayName(top)}?` : displayName(top)}
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
      {onDecide && result.decidingView && result.confidenceBand !== 'high' && (
        <div className="mt-3 rounded-2xl bg-white/10 p-3" data-testid="live-deciding">
          <p className="font-semibold text-white">{result.decidingView.prompt}</p>
          <p className="mt-0.5 text-sm text-white/70">{result.decidingView.reason}</p>
          <button
            type="button"
            onClick={() => onDecide(result.decidingView!)}
            className="mt-2 min-h-11 w-full rounded-xl bg-white/20 font-semibold text-white active:bg-white/30"
          >
            Show it to the camera
          </button>
        </div>
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
  /** The best uncertain match so far, offered as "See best match". */
  const [bestGuess, setBestGuess] = useState<Found>();
  const [tip, setTip] = useState<Tip>();
  /** The deciding angle asked for: shown over the camera until the next frame is identified. */
  const [deciding, setDeciding] = useState<DecidingView>();
  /** Why live mode is running light ("Low battery · Data saver"), shown quietly in the top bar. */
  const [light, setLight] = useState<string>();
  const dataSaver = useSetting('dataSaver');

  // Mutable loop state (read inside the interval without re-subscribing).
  const loop = useRef({
    detector: undefined as ObjectDetector | undefined,
    track: undefined as MediaStreamTrack | undefined,
    focus: undefined as Focus | undefined,
    /** Detected boxes from the last tick, for taps. */
    boxes: [] as Focus[],
    /** A tapped subject: identified straight away, and held while it's analysed. */
    tapped: undefined as Focus | undefined,
    focusIsPerson: false,
    lastLuma: undefined as Uint8ClampedArray | undefined,
    stillSince: 0,
    busy: false,
    /** A result card is showing: scanning waits until it's cleared. */
    paused: false,
    /** Frames agreeing so far on one species, and the most confident of them. */
    vote: undefined as { name: string; count: number; best: Found } | undefined,
    best: undefined as Found | undefined,
    /** Set while shooting the deciding angle: the next frame joins this identification. */
    join: undefined as Join | undefined,
    attempts: 0,
    nextAttemptAt: 0,
    done: false,
    policy: framePolicy({ dataSaver }) as FramePolicy,
    battery: undefined as { level: number; charging: boolean } | undefined,
    /** Smoothed time the loop's work takes per tick (detector and stillness check). */
    workMs: undefined as number | undefined,
    dataSaver,
  });

  /** Re-decide the frame rate and upload size; updates the indicator when it changes. */
  const updatePolicy = useCallback(() => {
    const l = loop.current;
    l.policy = framePolicy({
      batteryLevel: l.battery?.level,
      charging: l.battery?.charging,
      detectorMs: l.workMs,
      wasWarm: l.policy.warm,
      dataSaver: l.dataSaver,
    });
    setLight(lightLabel(l.policy.reasons));
  }, []);

  useEffect(() => {
    loop.current.dataSaver = dataSaver;
    updatePolicy();
  }, [dataSaver, updatePolicy]);

  useEffect(
    () =>
      watchBattery((b) => {
        loop.current.battery = b;
        updatePolicy();
      }),
    [updatePolicy],
  );

  const openDetails = useCallback(
    ({ result, frame, crop, crops, previous }: Found) => {
      loop.current.done = true;
      const all = crops ?? [{ blob: crop, feature: 'auto' }];
      session.adoptResult(
        all.map((c, i) => ({
          id: newId(),
          blob: c.blob,
          url: URL.createObjectURL(c.blob),
          feature: c.feature,
          original: i === 0 ? { blob: frame, url: URL.createObjectURL(frame) } : undefined,
        })),
        result,
        new Date(),
        previous,
      );
      navigate({ name: 'identify' }, { replace: true });
    },
    [session],
  );

  const show = useCallback((f: Found) => {
    const l = loop.current;
    l.vote = undefined;
    l.paused = true;
    setFound(f);
    setKind(getCategory(f.result.category).label);
    setStatus('found');
  }, []);

  const clear = useCallback(() => {
    const l = loop.current;
    setFound(undefined);
    setKind(undefined);
    setGuess(undefined);
    setTip(undefined);
    l.paused = false;
    l.vote = undefined;
    l.tapped = undefined;
    l.stillSince = 0;
    l.nextAttemptAt = performance.now() + 800;
    setStatus(l.attempts >= l.policy.maxAttempts ? 'exhausted' : 'aim');
  }, []);

  /** Ask for the deciding angle: clear the card, and send the next frame with this one. */
  const decide = useCallback(
    (f: Found, view: DecidingView) => {
      loop.current.join = {
        crops: f.crops ?? [{ blob: f.crop, feature: 'auto' }],
        frame: f.frame,
        category: f.result.category,
        previous: f.result,
        view,
      };
      setDeciding(view);
      clear();
    },
    [clear],
  );

  const cancelDecide = useCallback(() => {
    loop.current.join = undefined;
    setDeciding(undefined);
  }, []);

  const analyse = useCallback(
    async (manual = false) => {
      const video = videoRef.current;
      const l = loop.current;
      const f = manual ? l.tapped : l.focus;
      if (!video || !f || l.busy || l.done || l.paused) return;
      l.busy = true;
      l.attempts += 1;
      setStatus('analysing');
      setTip(undefined);
      setGuess(undefined);
      // The detector's hint shows straight away; automatic detection may refine it below.
      setKind(f.hint?.label);
      try {
        const pad = 0.15;
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
        const { cropMaxEdge, frameMaxEdge, quality } = l.policy;
        const frame = await grab(video, { x: 0, y: 0, w: vw, h: vh }, frameMaxEdge, quality);
        const crop =
          (manual ? await photoCrop(l.track, video, region, cropMaxEdge, quality) : undefined) ??
          (await grab(video, region, cropMaxEdge, quality));
        const location = await current().catch(() => undefined);
        // Shooting the deciding angle: this frame is added to the earlier one(s).
        const join = l.join;
        const crops: LiveCrop[] = join
          ? [...join.crops, { blob: crop, feature: join.view.feature }]
          : [{ blob: crop, feature: 'auto' }];
        const result = await identify(
          {
            observationId: newId(),
            category: join?.category ?? f.hint?.category ?? 'auto',
            images: crops,
            location,
            capturedAt: new Date(),
            timeSource: 'device',
            tilt: currentTilt(),
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
        const latest: Found = join
          ? { result, frame: join.frame, crop, crops, previous: join.previous }
          : { result, frame, crop };
        if (join && top && result.confidenceBand !== 'none' && !result.person) {
          // Several photos of one subject: show it straight away, no second frame needed.
          l.join = undefined;
          setDeciding(undefined);
          setKind(getCategory(result.category).label);
          show(latest);
        } else if (result.person) {
          setStatus('person');
          setKind('Person');
        } else if (!top || result.confidenceBand === 'none') {
          l.vote = undefined;
          setGuess(undefined);
          setTip('unsure');
          setStatus(l.attempts >= l.policy.maxAttempts ? 'exhausted' : 'aim');
        } else {
          setKind(getCategory(result.category).label);
          if (!l.best || top.finalConfidence > l.best.result.candidates[0].finalConfidence) {
            l.best = latest;
            setBestGuess(latest);
          }
          const name = top.scientificName.toLowerCase();
          const agrees = l.vote?.name === name;
          const count = agrees ? l.vote!.count + 1 : 1;
          const best =
            agrees && l.vote!.best.result.candidates[0].finalConfidence >= top.finalConfidence
              ? l.vote!.best
              : latest;
          if (manual || count >= VOTES_NEEDED) {
            // Uncertain matches are shown too, marked "Possible".
            show(manual ? latest : best);
          } else {
            // First sighting of this species: check another frame before showing it.
            l.vote = { name, count, best };
            setGuess(displayName(top));
            if (result.confidenceBand === 'low') setTip('unsure');
            setStatus(l.attempts >= l.policy.maxAttempts ? 'exhausted' : 'confirming');
          }
        }
      } catch (e) {
        setStatus('error');
        setError(e instanceof ClientError ? e.message : 'Live identification failed.');
      } finally {
        l.busy = false;
        l.tapped = undefined;
        l.nextAttemptAt = performance.now() + (l.vote ? CONFIRM_COOLDOWN_MS : l.policy.cooldownMs);
        l.stillSince = 0;
      }
    },
    [current, show],
  );

  /** Tap to identify: the detected box under the finger, else a square around the tap. */
  const onTap = useCallback(
    (e: React.PointerEvent) => {
      const video = videoRef.current;
      const l = loop.current;
      if (!video || !video.videoWidth || l.busy || l.paused || l.done) return;
      if (l.attempts >= l.policy.maxAttempts) return;
      const p = toVideo(video, e.clientX, e.clientY);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const hit = l.boxes
        .filter((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)
        .sort((a, b) => a.w * a.h - b.w * b.h)[0];
      const side = Math.min(vw, vh) * TAP_BOX;
      const focus: Focus =
        hit && hit.hint?.label !== 'Person'
          ? hit
          : {
              x: Math.min(Math.max(0, p.x - side / 2), vw - side),
              y: Math.min(Math.max(0, p.y - side / 2), vh - side),
              w: side,
              h: side,
            };
      l.tapped = focus;
      l.vote = undefined;
      setBox(toDisplay(video, focus));
      void analyse(true);
    },
    [analyse],
  );

  // Camera + detector setup.
  useEffect(() => {
    let stream: MediaStream | undefined;
    let cancelled = false;
    const l = loop.current;
    (async () => {
      try {
        // Ask for sharp frames: identification needs detail, not just a preview.
        startTiltTracking();
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) return;
        l.track = stream.getVideoTracks()[0];
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
        const create = (delegate: 'GPU' | 'CPU') =>
          ObjectDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate },
            runningMode: 'VIDEO',
            scoreThreshold: 0.4,
            maxResults: 5,
          });
        // Phones and browsers without usable WebGL can't run the GPU delegate.
        const detector = await create('GPU').catch(() => create('CPU'));
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
      l.track = undefined;
    };
  }, []);

  // Detection, stillness and capture loop.
  useEffect(() => {
    const probe = document.createElement('canvas');
    probe.width = 32;
    probe.height = 24;
    const ctx = probe.getContext('2d', { willReadFrequently: true })!;
    /** One pass of the loop; false when there was nothing to do (hidden, paused…). */
    const tick = (): boolean => {
      const video = videoRef.current;
      const l = loop.current;
      if (
        !video ||
        video.readyState < 2 ||
        l.done ||
        l.paused ||
        document.visibilityState !== 'visible'
      )
        return false;
      const now = performance.now();
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // 1. Where to look: the most prominent living thing (or bouquet), else the centre.
      let detections: ReturnType<ObjectDetector['detectForVideo']>['detections'] = [];
      if (l.detector) {
        try {
          detections = l.detector.detectForVideo(video, now).detections;
        } catch {
          // A detector that fails while running (e.g. a lost GPU context) would stop every
          // tick here; drop it and carry on with the centre box.
          l.detector.close();
          l.detector = undefined;
        }
      }
      l.boxes = detections
        .map((d) => ({ b: d.boundingBox, c: d.categories[0] }))
        .filter(({ b, c }) => b && c && HINTS[c.categoryName])
        .map(({ b, c }) => ({
          x: b!.originX,
          y: b!.originY,
          w: b!.width,
          h: b!.height,
          hint: HINTS[c!.categoryName],
          score: c!.score,
        }))
        .sort((a, b) => b.w * b.h * b.score - a.w * a.h * a.score);
      const best = l.boxes[0];
      const focus: Focus = l.tapped ?? best ?? centreBox(vw, vh);
      l.focus = focus;
      l.focusIsPerson = focus.hint?.label === 'Person';
      if (!l.busy) {
        setBox(toDisplay(video, focus));
        // While a match is being confirmed, keep the group the server found (e.g. "Fungus").
        if (!l.vote) setKind(focus.hint?.label);
        const subjects = l.boxes.filter((b) => b.hint?.label !== 'Person').length;
        setTip((current) =>
          subjects > 1 || focus.hint?.label === 'Flowers'
            ? 'several'
            : best && (best.w * best.h) / (vw * vh) < TOO_SMALL
              ? 'closer'
              : current === 'unsure'
                ? current
                : undefined,
        );
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
      else {
        l.stillSince = 0;
        // A big move means a different subject: start the vote again.
        if (motion > MOTION_THRESHOLD * 3 && l.vote && !l.busy) {
          l.vote = undefined;
          setTip(undefined);
          setStatus((st) => (st === 'confirming' ? 'aim' : st));
        }
      }

      // 3. People are recognised on the device; no need to send them anywhere.
      if (l.focusIsPerson && !l.busy) {
        setStatus('person');
        setKind('Person');
        return true;
      }
      if (l.busy || l.attempts >= l.policy.maxAttempts || now < l.nextAttemptAt) return true;
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
      return true;
    };
    // A timeout chain rather than an interval, so the policy can stretch the tick: the time
    // each pass takes is measured, and a rising time (a warm, throttled phone) backs it off.
    let t: ReturnType<typeof setTimeout>;
    const run = () => {
      const l = loop.current;
      const started = performance.now();
      if (tick()) {
        l.workMs = smoothLatency(l.workMs, performance.now() - started);
        updatePolicy();
      }
      t = setTimeout(run, loop.current.policy.tickMs);
    };
    t = setTimeout(run, loop.current.policy.tickMs);
    return () => clearTimeout(t);
  }, [analyse, updatePolicy]);

  const message: Partial<Record<Status, string>> = {
    starting: 'Starting camera',
    aim: 'Point at a plant, animal or mushroom, or tap it',
    steady: 'Hold steady',
    analysing: guess ? `${guess}…` : kind ? `Looks like a ${kind.toLowerCase()}…` : 'Identifying…',
    confirming: guess ? `${guess}? Checking again…` : 'Checking again…',
    person: 'That’s a person. Point at something wild',
    exhausted: 'Scan limit reached for this session',
    error: error ?? 'Something went wrong',
  };
  const tips: Record<NonNullable<Tip>, string> = {
    several: 'Several things in view: tap the one you mean',
    closer: 'Move closer, or tap it',
    unsure: 'Not sure yet. Move closer, or tap one flower, leaf or animal',
  };
  const scanning = status === 'analysing' || status === 'confirming';
  const showTip =
    tip && !found && status !== 'analysing' && status !== 'error' && status !== 'person';

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
        aria-label="Camera view. Tap something to identify it."
        onPointerUp={onTap}
        data-testid="live-video"
      />

      {box && status !== 'error' && !found && (
        <div
          className={`live-focus pointer-events-none absolute ${scanning ? 'live-focus-scanning' : ''}`}
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
              {scanning && <span className="text-white/60">·</span>}
              {scanning && <span className="text-white/80">{guess ?? 'identifying'}</span>}
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
        <div className="relative flex flex-col items-center">
          <span
            className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold ${GLASS}`}
          >
            <span className="live-dot h-2 w-2 rounded-full bg-[#ff5a3c]" />
            Live
          </span>
          {light && (
            <span
              className="readout absolute top-full mt-1.5 flex items-center gap-1.5 whitespace-nowrap text-[0.62rem] text-white/70 [text-shadow:0_1px_4px_rgba(0,0,0,0.7)]"
              data-testid="live-light"
              title="Scanning fewer frames to save battery, heat or data"
            >
              <Icon name="leaf" className="h-3 w-3" />
              {light}
            </span>
          )}
        </div>
        <span className="w-11" aria-hidden />
      </div>

      {/* Bottom: status pill and tips, or the match card */}
      <div className="safe-bottom absolute inset-x-0 bottom-0 px-4">
        {found ? (
          <FoundCard
            found={found}
            onClear={clear}
            onDetails={() => openDetails(found)}
            onDecide={
              // With the session's frames used up, clear() shows the scan limit instead.
              (found.crops?.length ?? 1) < UPLOAD.maxImages
                ? (view) => decide(found, view)
                : undefined
            }
          />
        ) : (
          <div className="flex flex-col items-center gap-3 pb-2">
            {deciding && status !== 'error' && status !== 'exhausted' && (
              <div
                className={`fade-up flex max-w-sm items-center gap-3 rounded-2xl px-4 py-2.5 ${GLASS}`}
                data-testid="live-deciding-hint"
              >
                <p className="text-[0.95rem] font-semibold text-white">
                  {deciding.prompt}
                  <span className="block text-xs font-normal text-white/70">
                    The next frame is added to this identification
                  </span>
                </p>
                <button
                  type="button"
                  onClick={cancelDecide}
                  className="min-h-11 shrink-0 rounded-xl px-2 text-sm font-semibold text-white/80"
                >
                  Cancel
                </button>
              </div>
            )}
            {showTip && !deciding && (
              <p
                className="fade-up max-w-xs text-center text-sm font-medium text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.7)]"
                data-testid="live-tip"
              >
                {tips[tip]}
              </p>
            )}
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
            {bestGuess && !scanning && status !== 'error' && (
              <button
                type="button"
                onClick={() => show(bestGuess)}
                className={`min-h-11 rounded-full px-4 text-sm font-semibold ${GLASS}`}
                data-testid="live-best"
              >
                See best match: {displayName(bestGuess.result.candidates[0])}
              </button>
            )}
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
