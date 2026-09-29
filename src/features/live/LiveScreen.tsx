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
import { saveToHistory, useSession } from '../identification/SessionContext';
import { useLocationState } from '../location/LocationContext';
import { mergeImages } from '../results/Gallery';
import {
  framePolicy,
  lightLabel,
  smoothLatency,
  watchBattery,
  type FramePolicy,
} from './framePolicy';
import { checkRegion } from './frameQuality';
import {
  closeSubjectLift,
  cropAround,
  liftSubject,
  loadSubjectLift,
  sameSubject,
  subjectLiftReady,
  LIFT_EDGE,
  type Lift,
} from './subjectLift';
import {
  MAX_DIGITAL_ZOOM,
  cameraZoomRange,
  clampInto,
  formatZoom,
  pinchZoom,
  visibleRect,
  zoomDisplay,
  type CameraZoom,
} from './zoom';

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
/** How often the tapped subject is re-cut to follow it, how long at most, and misses allowed. */
const TRACK_MS = 100;
/** How far ahead the wash is slid along the subject's motion between cut-outs. */
const PREDICT_MAX_MS = 200;
const TRACK_FOR_MS = 12_000;
const TRACK_MISSES = 3;

/** Thumbnails kept in the session strip. */
const SESSION_FINDS = 8;

/** How long a tap waits for the camera to refocus before taking the frame. */
const FOCUS_SETTLE_MS = 400;

/**
 * Tap to focus: asks the camera to focus and meter at `point` (0–1 in the frame). Chrome on
 * Android supports this; elsewhere it resolves false and nothing changes.
 */
async function focusAt(
  track: MediaStreamTrack | undefined,
  point: { x: number; y: number },
): Promise<boolean> {
  const caps = (track?.getCapabilities?.() ?? {}) as {
    pointsOfInterest?: unknown;
    focusMode?: string[];
    exposureMode?: string[];
  };
  if (!track || !('pointsOfInterest' in caps)) return false;
  const set: Record<string, unknown> = { pointsOfInterest: [point] };
  if (caps.focusMode?.includes('single-shot')) set.focusMode = 'single-shot';
  else if (caps.focusMode?.includes('continuous')) set.focusMode = 'continuous';
  if (caps.exposureMode?.includes('continuous')) set.exposureMode = 'continuous';
  try {
    await track.applyConstraints({ advanced: [set as MediaTrackConstraintSet] });
    return true;
  } catch {
    return false;
  }
}

/** A subject box touching the edge of the view (and not simply filling it). */
function touchesEdge(b: Rect, v: Rect): boolean {
  const mx = v.w * 0.03;
  const my = v.h * 0.03;
  const left = b.x <= v.x + mx;
  const right = b.x + b.w >= v.x + v.w - mx;
  const top = b.y <= v.y + my;
  const bottom = b.y + b.h >= v.y + v.h - my;
  return (
    ((left || right) && b.w < v.w * 0.8 && !(left && right)) ||
    ((top || bottom) && b.h < v.h * 0.8 && !(top && bottom))
  );
}

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
type Tip = 'several' | 'closer' | 'unsure' | 'dark' | 'blurry' | undefined;

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Crops are at least this many video pixels across (or the whole frame, if smaller), so a
 * zoomed-in or low-resolution view never sends a crop too small to identify.
 */
const MIN_CROP_PX = 128;

/** A crop kept on screen where it fits, otherwise (a tiny view) just inside the frame. */
function fitCrop(r: Rect, visible: Rect, vw: number, vh: number): Rect {
  const min = Math.min(MIN_CROP_PX, vw, vh);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const w = Math.max(r.w, min);
  const h = Math.max(r.h, min);
  const grown = { x: cx - w / 2, y: cy - h / 2, w, h };
  return w <= visible.w && h <= visible.h
    ? clampInto(grown, visible)
    : clampInto(grown, { x: 0, y: 0, w: vw, h: vh });
}

/** Centre square covering 60% of the shorter side of the visible part of the frame. */
function centreBox(visible: Rect, vw: number, vh: number): Rect {
  const side = Math.min(visible.w, visible.h) * 0.6;
  return fitCrop(
    {
      x: visible.x + (visible.w - side) / 2,
      y: visible.y + (visible.h - side) / 2,
      w: side,
      h: side,
    },
    visible,
    vw,
    vh,
  );
}

/** The part of the video frame on screen, allowing for digital zoom. */
function onScreen(video: HTMLVideoElement, zoom: number): Rect {
  return visibleRect(
    video.videoWidth,
    video.videoHeight,
    video.clientWidth || video.videoWidth,
    video.clientHeight || video.videoHeight,
    zoom,
  );
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

/**
 * Where a video rectangle appears on screen, as fractions of the element (object-fit: cover),
 * after any digital zoom.
 */
function toDisplay(video: HTMLVideoElement, r: Rect, zoom = 1): Rect {
  const cw = video.clientWidth || 1;
  const ch = video.clientHeight || 1;
  const scale = Math.max(cw / video.videoWidth, ch / video.videoHeight);
  const ox = (cw - video.videoWidth * scale) / 2;
  const oy = (ch - video.videoHeight * scale) / 2;
  return zoomDisplay(
    {
      x: (r.x * scale + ox) / cw,
      y: (r.y * scale + oy) / ch,
      w: (r.w * scale) / cw,
      h: (r.h * scale) / ch,
    },
    zoom,
  );
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
  onSave,
  saveState,
}: {
  found: Found;
  onClear: () => void;
  onDetails: () => void;
  /** Save to the Field Journal and stay in live mode. */
  onSave: () => void;
  saveState?: 'saving' | 'saved' | 'failed';
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
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onClear}
          className="min-h-12 rounded-2xl bg-white/15 font-semibold text-white active:bg-white/25"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saveState === 'saving' || saveState === 'saved'}
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-white/15 font-semibold text-white active:bg-white/25 disabled:opacity-100"
          data-testid="live-save"
        >
          {saveState === 'saved' ? (
            <>
              <Icon name="check" className="h-4 w-4" /> Saved
            </>
          ) : saveState === 'saving' ? (
            'Saving…'
          ) : saveState === 'failed' ? (
            'Try again'
          ) : (
            'Save'
          )}
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
  /**
   * The tapped subject, cut out and washed in white over the live view. It's followed as the
   * subject or the phone moves (re-cut a few times a second), and fades out (`leaving`) once
   * the result shows or the subject is lost.
   */
  const [lift, setLift] = useState<
    Lift & {
      id: number;
      leaving?: boolean;
      /** When its frame was captured, and the subject's velocity (frame fractions per ms). */
      at: number;
      v: { x: number; y: number };
    }
  >();
  const liftMoveRef = useRef<HTMLDivElement>(null);
  /** This session's matches, newest first, one per species: the strip along the bottom. */
  const [finds, setFinds] = useState<{ name: string; found: Found; thumb: string }[]>([]);
  /** Matches saved to the journal from the card (by result id). */
  const [saved, setSaved] = useState<Record<string, 'saving' | 'saved' | 'failed'>>({});
  /** Where the last tap was, for the focus ring (px within the screen). */
  const [ring, setRing] = useState<{ x: number; y: number; id: number }>();
  /** The followed subject is at the edge of the view. */
  const [atEdge, setAtEdge] = useState(false);
  /** Zoom shown to the person (camera zoom, or on-screen magnification), and on-screen scale. */
  const [zoom, setZoom] = useState(1);
  const [digitalZoom, setDigitalZoom] = useState(1);

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
    /** The camera's own zoom range, when it has one; otherwise zoom is on screen. */
    cameraZoom: undefined as CameraZoom | undefined,
    zoom: 1,
    digitalZoom: 1,
    /** Fingers on the view, for pinch and tap. */
    pointers: new Map<number, { x: number; y: number }>(),
    pinch: undefined as { distance: number; zoom: number } | undefined,
    /** The current touch became a pinch (or moved), so lifting the finger isn't a tap. */
    gesture: false,
    downAt: undefined as { x: number; y: number } | undefined,
    zoomPending: undefined as number | undefined,
    liftId: 0,
    ringId: 0,
    /** Object URLs made for the session strip, released on leaving. */
    thumbs: [] as string[],
    /** The tapped subject being followed: its last cut-out, missed updates, and when it began. */
    follow: undefined as
      | { last: Lift; at: number; v: { x: number; y: number }; misses: number; since: number }
      | undefined,
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

  /** Stop following the tapped subject; its wash fades out. */
  const stopTracking = useCallback(() => {
    loop.current.follow = undefined;
    setAtEdge(false);
    setLift((current) => current && { ...current, leaving: true });
  }, []);

  /**
   * Show a match. `fresh` is a new result (not one reopened from the session strip or "See
   * best match"): it gets a short, silent buzz and joins the strip.
   */
  const show = useCallback(
    (f: Found, fresh = true) => {
      const l = loop.current;
      stopTracking();
      l.vote = undefined;
      l.paused = true;
      setFound(f);
      setKind(getCategory(f.result.category).label);
      setStatus('found');
      if (!fresh) return;
      try {
        navigator.vibrate?.(30);
      } catch {
        /* not supported (iOS) */
      }
      const name = f.result.candidates[0]?.scientificName.toLowerCase();
      if (!name) return;
      const thumb = URL.createObjectURL(f.crops?.[0]?.blob ?? f.crop);
      l.thumbs.push(thumb);
      setFinds((list) =>
        [{ name, found: f, thumb }, ...list.filter((x) => x.name !== name)].slice(0, SESSION_FINDS),
      );
    },
    [stopTracking],
  );

  // The strip's thumbnails are object URLs: release them when leaving live mode.
  useEffect(() => {
    const l = loop.current;
    return () => {
      for (const url of l.thumbs) URL.revokeObjectURL(url);
      l.thumbs = [];
    };
  }, []);

  /** Save the shown match to the Field Journal without leaving live mode. */
  const save = useCallback(async (f: Found) => {
    const id = f.result.requestId;
    setSaved((m) => ({ ...m, [id]: 'saving' }));
    const ok = await saveToHistory(
      id,
      f.result,
      { blob: f.crops?.[0]?.blob ?? f.crop, original: { blob: f.frame } },
      new Date(),
    );
    setSaved((m) => ({ ...m, [id]: ok ? 'saved' : 'failed' }));
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
    stopTracking();
    l.stillSince = 0;
    l.nextAttemptAt = performance.now() + 800;
    setStatus(l.attempts >= l.policy.maxAttempts ? 'exhausted' : 'aim');
  }, [stopTracking]);

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

  /**
   * Cut out the subject at `point` (0–1 in the frame) from the live view and start following
   * it. Returns the cut-out, or undefined when the model isn't loaded or nothing clear is there.
   */
  const liftAt = useCallback(
    (video: HTMLVideoElement, point: { x: number; y: number }, maxArea = 1): Lift | undefined => {
      const l = loop.current;
      const segmenter = subjectLiftReady();
      if (!segmenter) return undefined;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.min(1, LIFT_EDGE / Math.max(vw, vh));
      const snapshot = document.createElement('canvas');
      snapshot.width = Math.round(vw * scale);
      snapshot.height = Math.round(vh * scale);
      snapshot.getContext('2d')?.drawImage(video, 0, 0, snapshot.width, snapshot.height);
      const lifted = liftSubject(segmenter, snapshot, point, vw);
      if (!lifted || lifted.area > maxArea || l.done || l.paused) return undefined;
      l.liftId += 1;
      const at = performance.now();
      const v = { x: 0, y: 0 };
      setLift({ ...lifted, id: l.liftId, at, v });
      l.follow = { last: lifted, at, v, misses: 0, since: at };
      return lifted;
    },
    [],
  );

  const analyse = useCallback(
    async (manual = false) => {
      const video = videoRef.current;
      const l = loop.current;
      const f = manual ? l.tapped : l.focus;
      if (!video || !f || l.busy || l.done || l.paused) return;
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
      // Don't spend an identification on a frame that's too dark or blurred. A scan waits for
      // a better one; a tap gives the camera a moment to focus, then goes with the best it got.
      const probe = document.createElement('canvas');
      let q = checkRegion(video, region, probe);
      if (manual) {
        for (let i = 0; i < 3 && q?.problem === 'blurry'; i++) {
          await new Promise((r) => setTimeout(r, 250));
          q = checkRegion(video, region, probe);
        }
      }
      if (q?.problem === 'dark' || (q?.problem === 'blurry' && !manual)) {
        setTip(q.problem);
        if (manual) stopTracking();
        l.stillSince = 0;
        l.nextAttemptAt = performance.now() + 700;
        return;
      }
      l.busy = true;
      l.attempts += 1;
      setStatus('analysing');
      setTip(undefined);
      setGuess(undefined);
      // The detector's hint shows straight away; automatic detection may refine it below.
      setKind(f.hint?.label);
      // Automatic scans get the same outline as taps, on whatever is in the middle of the box.
      if (!manual && !l.follow) {
        liftAt(video, { x: (f.x + f.w / 2) / vw, y: (f.y + f.h / 2) / vh }, 0.6);
      }
      try {
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
        // Keep following the tapped subject until the result shows (or it's lost).
        l.nextAttemptAt = performance.now() + (l.vote ? CONFIRM_COOLDOWN_MS : l.policy.cooldownMs);
        l.stillSince = 0;
      }
    },
    [current, show, liftAt, stopTracking],
  );

  /** Zoom to `z`: the camera's own zoom where it has one, else magnify the view. */
  const applyZoom = useCallback((z: number) => {
    const l = loop.current;
    const range = l.cameraZoom;
    if (range) {
      const clamped = Math.min(range.max, Math.max(range.min, z));
      l.zoom = clamped;
      setZoom(clamped / range.min);
      // Coalesce: pinch events arrive faster than the camera applies a zoom.
      if (l.zoomPending === undefined) {
        l.zoomPending = clamped;
        requestAnimationFrame(() => {
          const target = l.zoomPending!;
          l.zoomPending = undefined;
          void l.track
            ?.applyConstraints({ advanced: [{ zoom: target } as MediaTrackConstraintSet] })
            .catch(() => undefined);
        });
      } else l.zoomPending = clamped;
    } else {
      const clamped = Math.min(MAX_DIGITAL_ZOOM, Math.max(1, z));
      l.zoom = clamped;
      l.digitalZoom = clamped;
      setZoom(clamped);
      setDigitalZoom(clamped);
    }
    // A new view: whatever was being confirmed may be off screen now.
    l.vote = undefined;
    l.stillSince = 0;
  }, []);

  const resetZoom = useCallback(() => {
    applyZoom(loop.current.cameraZoom?.min ?? 1);
  }, [applyZoom]);

  /** Tap to identify: the thing under the finger, cut out where the segmenter can. */
  const tapAt = useCallback(
    (clientX: number, clientY: number) => {
      const video = videoRef.current;
      const l = loop.current;
      if (!video || !video.videoWidth || l.busy || l.paused || l.done) return;
      if (l.attempts >= l.policy.maxAttempts) return;
      const p = toVideo(video, clientX, clientY);
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const visible = onScreen(video, l.digitalZoom);
      const hit = l.boxes
        .filter((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)
        .sort((a, b) => a.w * a.h - b.w * b.h)[0];

      // Tap to focus: point the camera's focus and exposure here where it can (Android).
      const focusing = focusAt(l.track, { x: p.x / vw, y: p.y / vh });
      const root = video.closest('[data-testid=live-screen]')?.getBoundingClientRect();
      l.ringId += 1;
      setRing({ x: clientX - (root?.left ?? 0), y: clientY - (root?.top ?? 0), id: l.ringId });

      const side = Math.min(visible.w, visible.h) * TAP_BOX;
      const hint = hit && hit.hint?.label !== 'Person' ? hit.hint : undefined;
      const square: Rect =
        hit && hint ? hit : { x: p.x - side / 2, y: p.y - side / 2, w: side, h: side };
      const target = (region: Rect): Focus => ({ ...fitCrop(region, visible, vw, vh), hint });
      l.tapped = target(square);
      l.vote = undefined;
      // Claim the tap now, so the scan loop and other taps wait for it.
      l.busy = true;
      l.follow = undefined;
      setLift(undefined);
      setAtEdge(false);
      setBox(toDisplay(video, l.tapped, l.digitalZoom));

      // Let the tap register on screen, then cut out the subject under the finger (when the
      // segmenter has loaded; taps never wait for it) and identify a crop around it.
      requestAnimationFrame(() =>
        setTimeout(async () => {
          if (!subjectLiftReady()) void loadSubjectLift(WASM_URL);
          const lifted = liftAt(video, { x: p.x / vw, y: p.y / vh });
          if (lifted) {
            l.tapped = target(cropAround(lifted.box, 1, vw, vh, { margin: 0, minShare: 0.15 }));
            setBox(toDisplay(video, l.tapped, l.digitalZoom));
          }
          // Give the camera a moment to refocus on the new point before the frame is taken.
          if (await focusing) await new Promise((r) => setTimeout(r, FOCUS_SETTLE_MS));
          l.busy = false;
          if (l.done || l.paused) {
            l.follow = undefined;
            setLift(undefined);
            return;
          }
          void analyse(true);
        }, 0),
      );
    },
    [analyse, liftAt],
  );

  // Follow the tapped subject: re-cut it from the live view a few times a second, starting
  // inside where it last was, so the wash stays on it as it (or the phone) moves. A cut-out
  // that isn't plausibly the same thing counts as a miss; a few misses in a row and it's lost.
  useEffect(() => {
    const snapshot = document.createElement('canvas');
    const step = () => {
      const l = loop.current;
      const video = videoRef.current;
      const segmenter = subjectLiftReady();
      const track = l.follow;
      if (!track || !segmenter || !video?.videoWidth || document.visibilityState !== 'visible')
        return;
      if (performance.now() - track.since > TRACK_FOR_MS) {
        stopTracking();
        return;
      }
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const at = performance.now();
      const scale = Math.min(1, LIFT_EDGE / Math.max(vw, vh));
      snapshot.width = Math.round(vw * scale);
      snapshot.height = Math.round(vh * scale);
      snapshot.getContext('2d')?.drawImage(video, 0, 0, snapshot.width, snapshot.height);
      const next = liftSubject(segmenter, snapshot, track.last.inside, vw);
      if (l.follow !== track) return; // stopped (or re-tapped) meanwhile
      if (next && sameSubject(track.last, next)) {
        // Velocity from the last two cut-outs (smoothed), to slide the wash between updates.
        const dt = Math.max(1, at - track.at);
        const v = {
          x: 0.5 * track.v.x + (0.5 * (next.inside.x - track.last.inside.x)) / dt,
          y: 0.5 * track.v.y + (0.5 * (next.inside.y - track.last.inside.y)) / dt,
        };
        track.last = next;
        track.at = at;
        track.v = v;
        track.misses = 0;
        setLift((current) =>
          current && !current.leaving ? { ...next, id: current.id, at, v } : current,
        );
        const visible = onScreen(video, l.digitalZoom);
        setAtEdge(touchesEdge(next.box, visible));
      } else if (++track.misses >= TRACK_MISSES) {
        stopTracking();
      }
    };
    let t: ReturnType<typeof setTimeout>;
    const run = () => {
      step();
      // Lighter when live mode is saving battery, heat or data.
      // The cut-out runs on the phone (no data); only a low battery slows it.
      t = setTimeout(
        run,
        loop.current.policy.reasons.includes('battery') ? TRACK_MS * 2 : TRACK_MS,
      );
    };
    t = setTimeout(run, TRACK_MS);
    return () => clearTimeout(t);
  }, [stopTracking]);

  // Between cut-outs, slide the wash along the subject's motion so it doesn't trail behind.
  useEffect(() => {
    if (!lift || lift.leaving) return;
    let raf = 0;
    const frame = () => {
      const el = liftMoveRef.current;
      const video = videoRef.current;
      if (el && video?.videoWidth) {
        const dt = Math.min(PREDICT_MAX_MS, performance.now() - lift.at);
        const scale = Math.max(
          (video.clientWidth || 1) / video.videoWidth,
          (video.clientHeight || 1) / video.videoHeight,
        );
        const dx = lift.v.x * dt * video.videoWidth * scale;
        const dy = lift.v.y * dt * video.videoHeight * scale;
        el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [lift]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const l = loop.current;
    l.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (l.pointers.size === 1) {
      l.gesture = false;
      l.downAt = { x: e.clientX, y: e.clientY };
    }
    if (l.pointers.size === 2) {
      const [a, b] = [...l.pointers.values()];
      l.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: l.zoom };
      l.gesture = true;
    }
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const l = loop.current;
      if (!l.pointers.has(e.pointerId)) return;
      l.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (l.downAt && Math.hypot(e.clientX - l.downAt.x, e.clientY - l.downAt.y) > 12)
        l.gesture = true;
      if (l.pinch && l.pointers.size >= 2) {
        const [a, b] = [...l.pointers.values()];
        const range = l.cameraZoom;
        applyZoom(
          pinchZoom(
            l.pinch.zoom,
            l.pinch.distance,
            Math.hypot(a.x - b.x, a.y - b.y),
            range?.min ?? 1,
            range?.max ?? MAX_DIGITAL_ZOOM,
          ),
        );
      }
    },
    [applyZoom],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const l = loop.current;
      const wasTap = l.pointers.size === 1 && !l.gesture && e.type === 'pointerup';
      l.pointers.delete(e.pointerId);
      if (l.pointers.size < 2) l.pinch = undefined;
      if (wasTap) tapAt(e.clientX, e.clientY);
    },
    [tapAt],
  );

  // iOS Safari zooms the whole page on a pinch unless its gesture events are cancelled.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const events = ['gesturestart', 'gesturechange', 'gestureend'];
    for (const name of events) document.addEventListener(name, stop, { passive: false });
    return () => {
      for (const name of events) document.removeEventListener(name, stop);
    };
  }, []);

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
        l.cameraZoom = cameraZoomRange(l.track);
        if (l.cameraZoom) {
          const now = (l.track.getSettings() as { zoom?: number }).zoom;
          l.zoom = now ?? l.cameraZoom.min;
          setZoom(l.zoom / l.cameraZoom.min);
        }
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
      // Load the tap cut-out model (~6 MB) in the background, so the first tap gets it. With
      // data saver on it waits for the first tap instead.
      if (!cancelled && !l.dataSaver) void loadSubjectLift(WASM_URL);
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      l.detector?.close();
      l.detector = undefined;
      l.track = undefined;
      closeSubjectLift();
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
      const visible = onScreen(video, l.digitalZoom);
      const inView = (b: Rect) => {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        return (
          cx >= visible.x &&
          cx <= visible.x + visible.w &&
          cy >= visible.y &&
          cy <= visible.y + visible.h
        );
      };
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
        // Zoomed in on screen: only what's visible counts.
        .filter(inView)
        .map((b) => ({ ...b, ...fitCrop(b, visible, video.videoWidth, video.videoHeight) }))
        .sort((a, b) => b.w * b.h * b.score - a.w * a.h * a.score);
      const best = l.boxes[0];
      const focus: Focus =
        l.tapped ?? best ?? centreBox(visible, video.videoWidth, video.videoHeight);
      l.focus = focus;
      l.focusIsPerson = focus.hint?.label === 'Person';
      if (!l.busy) {
        setBox(toDisplay(video, focus, l.digitalZoom));
        // While a match is being confirmed, keep the group the server found (e.g. "Fungus").
        if (!l.vote) setKind(focus.hint?.label);
        const subjects = l.boxes.filter((b) => b.hint?.label !== 'Person').length;
        setTip((current) =>
          subjects > 1 || focus.hint?.label === 'Flowers'
            ? 'several'
            : best && (best.w * best.h) / (visible.w * visible.h) < TOO_SMALL
              ? 'closer'
              : current === 'unsure' || current === 'dark' || current === 'blurry'
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
    dark: 'Too dark to identify. Find more light',
    blurry: 'Too blurry. Hold steady or tap to focus',
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
      {/* The camera view: tap to identify, pinch to zoom (never the page). */}
      <div
        className="absolute inset-0 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-testid="live-view"
      >
        <div
          className="absolute inset-0"
          style={digitalZoom > 1 ? { transform: `scale(${digitalZoom})` } : undefined}
        >
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            playsInline
            muted
            aria-label="Camera view. Tap something to identify it, pinch to zoom."
            data-testid="live-video"
          />
          {lift && (
            <div
              key={lift.id}
              className={`subject-lift ${lift.leaving ? 'subject-lift-leaving' : ''}`}
              aria-hidden
              data-testid="live-lift"
              onAnimationEnd={(e) => {
                // Removed once its fade-out ends (not on the flash or the inner sweep).
                if (e.target === e.currentTarget && lift.leaving)
                  setLift((l) => (l?.id === lift.id ? undefined : l));
              }}
            >
              <div ref={liftMoveRef} className="absolute inset-0">
                <div
                  className="subject-lift-mask"
                  style={{
                    maskImage: `url(${lift.maskUrl})`,
                    WebkitMaskImage: `url(${lift.maskUrl})`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {ring && !found && (
        <span
          key={ring.id}
          className="live-focus-ring pointer-events-none absolute"
          style={{ left: ring.x, top: ring.y }}
          aria-hidden
          data-testid="live-focus-ring"
          onAnimationEnd={() => setRing((r) => (r?.id === ring.id ? undefined : r))}
        />
      )}
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
          {/* The white cut-out already shows what's being identified. */}
          {(!lift || lift.leaving) &&
            (['tl', 'tr', 'bl', 'br'] as const).map((c) => (
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
            onSave={() => void save(found)}
            saveState={saved[found.result.requestId]}
            onDecide={
              // With the session's frames used up, clear() shows the scan limit instead.
              (found.crops?.length ?? 1) < UPLOAD.maxImages
                ? (view) => decide(found, view)
                : undefined
            }
          />
        ) : (
          <div className="flex flex-col items-center gap-3 pb-2">
            {finds.length > 0 && (
              <ul
                className="flex max-w-full gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none]"
                aria-label="Found this session"
                data-testid="live-finds"
              >
                {finds.map((x) => {
                  const name = displayName(x.found.result.candidates[0]);
                  return (
                    <li key={x.name} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => show(x.found, false)}
                        className="block h-11 w-11 overflow-hidden rounded-full border-2 border-white/80 shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
                        aria-label={`Show ${name} again`}
                        title={name}
                      >
                        <img src={x.thumb} alt="" className="h-full w-full object-cover" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
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
            {atEdge && !found && (
              <p
                className="fade-up text-center text-sm font-medium text-white [text-shadow:0_1px_6px_rgba(0,0,0,0.7)]"
                data-testid="live-edge"
              >
                Keep it in frame
              </p>
            )}
            {zoom > 1.05 && (
              <button
                type="button"
                onClick={resetZoom}
                className={`readout min-h-9 rounded-full px-3 text-xs font-semibold ${GLASS}`}
                aria-label={`Zoomed ${formatZoom(zoom)}. Tap to zoom out`}
                data-testid="live-zoom"
              >
                {formatZoom(zoom)}
              </button>
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
                onClick={() => show(bestGuess, false)}
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
