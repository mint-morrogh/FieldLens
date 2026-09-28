import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { UPLOAD } from '../../../shared/config';
import { toApproxLocation } from '../../../shared/geo';
import type {
  ApproxLocation,
  FeatureId,
  IdentifyResponse,
  IdentifyStage,
  IdentifyTarget,
  StageEvent,
} from '../../../shared/types';
import { ClientError, identify } from '../../lib/api';
import { newId } from '../../lib/ids';
import { readPhotoMetadata } from '../../lib/exif';
import { cropAndEncode, makeDisplayCopy, makeThumbnail } from '../../lib/image';
import type { Box } from '../crop/cropMath';
import { saveObservation, toRecord } from '../history/historyStore';
import { useLocationState } from '../location/LocationContext';

export type SessionImage = {
  id: string;
  /** Cropped, resized JPEG that is uploaded. */
  blob: Blob;
  url: string;
  feature: FeatureId;
  /** The full original photo, kept in memory for the full-screen viewer (never uploaded). */
  original?: { blob: Blob; url: string };
};

export type Step = 'idle' | 'crop' | 'submitting' | 'result' | 'error';

export type PhotoSource = 'camera' | 'library';
/** here = the device's current location; photo = the photo's own GPS; none = don't use location. */
export type LocationChoice = 'here' | 'photo' | 'none';

export type Progress = {
  phase: 'preparing' | 'uploading' | 'identifying';
  fraction: number;
  /** Server-reported pipeline stages, updated live as they stream in. */
  stages: Partial<Record<IdentifyStage, StageEvent['status']>>;
  preview?: StageEvent['preview'];
};

const EMPTY_PROGRESS: Progress = { phase: 'preparing', fraction: 0, stages: {} };

export type SessionState = {
  step: Step;
  category: IdentifyTarget;
  observationId: string;
  capturedAt: Date;
  images: SessionImage[];
  /** Full original photo awaiting a crop; stays on-device. */
  pending?: { blob: Blob; url: string };
  pendingFeature: FeatureId;
  /** Where the location for this identification comes from (asked for library photos). */
  locationChoice: LocationChoice;
  /** Whether the first photo came from the camera or the library (the question is only asked for library photos). */
  photoSource?: PhotoSource;
  /** Read on-device from the first library photo's EXIF; position already rounded to ~1 km. */
  photoMeta?: { location?: ApproxLocation; takenAt?: Date };
  progress: Progress;
  result?: IdentifyResponse;
  previousResult?: IdentifyResponse;
  error?: ClientError;
};

type Action =
  | { type: 'reset'; category: IdentifyTarget }
  | { type: 'setCategory'; category: IdentifyTarget }
  | { type: 'setPendingFeature'; feature: FeatureId }
  | { type: 'photo'; blob: Blob; url: string; source: PhotoSource }
  | { type: 'photoMeta'; meta: SessionState['photoMeta']; choice: LocationChoice }
  | { type: 'setLocationChoice'; choice: LocationChoice }
  | { type: 'cancelCapture' }
  | { type: 'addImage'; image: SessionImage }
  | { type: 'removeImage'; id: string }
  | { type: 'submitting'; phase: Progress['phase']; fraction: number; restart?: boolean }
  | { type: 'stage'; event: StageEvent }
  | { type: 'result'; result: IdentifyResponse }
  | { type: 'error'; error: ClientError }
  | { type: 'adopt'; image: SessionImage; result: IdentifyResponse; capturedAt: Date };

function freshState(category: IdentifyTarget): SessionState {
  return {
    step: 'idle',
    category,
    observationId: newId(),
    capturedAt: new Date(),
    images: [],
    pendingFeature: 'auto',
    locationChoice: 'here',
    progress: EMPTY_PROGRESS,
  };
}

export function sessionReducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'reset':
      return freshState(action.category);
    case 'setCategory':
      return { ...state, category: action.category };
    case 'setPendingFeature':
      return { ...state, pendingFeature: action.feature };
    case 'photo': {
      const first = state.images.length === 0;
      return {
        ...state,
        step: 'crop',
        pending: { blob: action.blob, url: action.url },
        capturedAt: first ? new Date() : state.capturedAt,
        // The first photo decides the session's location source; follow-ups keep it.
        photoSource: first ? action.source : state.photoSource,
        locationChoice: first && action.source === 'camera' ? 'here' : state.locationChoice,
        photoMeta: first ? undefined : state.photoMeta,
      };
    }
    case 'photoMeta':
      return {
        ...state,
        photoMeta: action.meta,
        locationChoice: action.choice,
        capturedAt: action.meta?.takenAt ?? state.capturedAt,
      };
    case 'setLocationChoice':
      return { ...state, locationChoice: action.choice };
    case 'cancelCapture':
      return {
        ...state,
        pending: undefined,
        step: state.result ? 'result' : state.error ? 'error' : 'idle',
      };
    case 'addImage':
      return { ...state, images: [...state.images, action.image], pending: undefined };
    case 'removeImage':
      return { ...state, images: state.images.filter((i) => i.id !== action.id) };
    case 'submitting': {
      const base = action.restart ? EMPTY_PROGRESS : state.progress;
      return {
        ...state,
        step: 'submitting',
        error: undefined,
        progress: { ...base, phase: action.phase, fraction: action.fraction },
      };
    }
    case 'stage':
      return {
        ...state,
        progress: {
          ...state.progress,
          phase: 'identifying',
          fraction: 1,
          stages: { ...state.progress.stages, [action.event.stage]: action.event.status },
          preview: action.event.preview ?? state.progress.preview,
        },
      };
    case 'result':
      return {
        ...state,
        step: 'result',
        previousResult: state.result,
        result: action.result,
        error: undefined,
      };
    case 'error':
      return { ...state, step: 'error', error: action.error };
    case 'adopt':
      // A live-camera identification: the frame becomes the session's first photo.
      return {
        ...freshState('auto'),
        step: 'result',
        images: [action.image],
        capturedAt: action.capturedAt,
        photoSource: 'camera',
        locationChoice: 'here',
        result: action.result,
      };
  }
}

type SessionApi = {
  state: SessionState;
  /** Show a result identified from the live camera, as if it came from a photo. */
  adoptResult: (image: SessionImage, result: IdentifyResponse, capturedAt: Date) => void;
  setCategory: (category: IdentifyTarget) => void;
  /** Start a fresh session with a newly taken or chosen photo. */
  startWithPhoto: (blob: Blob, source?: PhotoSource) => void;
  /** Remember which feature (e.g. flower) the next follow-up photo shows. */
  startFollowUp: (feature: FeatureId) => void;
  photoSelected: (blob: Blob, source?: PhotoSource) => void;
  setLocationChoice: (choice: LocationChoice) => void;
  cancelCapture: () => void;
  confirmCrop: (box: Box, feature: FeatureId) => Promise<void>;
  removeImage: (id: string) => void;
  submit: (
    images?: SessionImage[],
    options?: { category?: IdentifyTarget; locationChoice?: LocationChoice },
  ) => Promise<void>;
  reset: () => void;
  canAddMore: boolean;
};

/** The app's default: detect the group automatically (the server falls back to plants). */
const CLIENT_DEFAULT_TARGET: IdentifyTarget = 'auto';

/** A library photo taken this recently is assumed to be from here. */
const RECENT_PHOTO_MS = 3 * 60 * 60 * 1000;

const RESULT_REVEAL_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 450;

const SessionContext = createContext<SessionApi | null>(null);

/**
 * Save locally (thumbnail + result, never coordinates). Saved straight away so leaving the
 * app quickly can't lose it, then updated with a thumbnail and a high-quality copy.
 * Failure here must never affect the result.
 */
function saveToHistory(
  observationId: string,
  result: IdentifyResponse,
  first: SessionImage | undefined,
  capturedAt: Date,
) {
  if (result.candidates.length === 0 || !first) return;
  void saveObservation(toRecord(observationId, result, undefined, capturedAt))
    .then(() =>
      Promise.all([
        makeThumbnail(first.blob).catch(() => undefined),
        makeDisplayCopy(first.original?.blob ?? first.blob).catch(() => undefined),
      ]),
    )
    .then(([thumb, photo]) =>
      saveObservation(toRecord(observationId, result, thumb, capturedAt, photo)),
    )
    .catch(() => undefined);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  // Snap first: with nothing picked, the server works out what the photo shows.
  const [state, dispatch] = useReducer(sessionReducer, CLIENT_DEFAULT_TARGET, freshState);
  // Latest state for async callbacks, which must not capture a stale render.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });
  const { current: currentLocation } = useLocationState();

  // Revoke object URLs when images leave the session.
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const live = new Set([
      ...state.images.flatMap((i) => (i.original ? [i.url, i.original.url] : [i.url])),
      ...(state.pending ? [state.pending.url] : []),
    ]);
    for (const url of urls.current) if (!live.has(url)) URL.revokeObjectURL(url);
    urls.current = live;
  }, [state.images, state.pending]);

  /**
   * For library photos: read EXIF on-device, then pick a sensible default for
   * "Where was this photo taken?" — the photo's own location if it has one,
   * "here" if it was taken in the last few hours, otherwise "somewhere else".
   */
  const inspectLibraryPhoto = useCallback(async (blob: Blob) => {
    const meta = await readPhotoMetadata(blob);
    const location =
      meta.latitude !== undefined && meta.longitude !== undefined
        ? toApproxLocation(meta.latitude, meta.longitude)
        : undefined;
    const when = meta.takenAt?.getTime() ?? (blob instanceof File ? blob.lastModified : undefined);
    const recent = when !== undefined && Date.now() - when < RECENT_PHOTO_MS;
    const choice: LocationChoice = location ? 'photo' : recent ? 'here' : 'none';
    dispatch({ type: 'photoMeta', meta: { location, takenAt: meta.takenAt }, choice });
  }, []);

  /** `images` overrides state when called right after a dispatch that hasn't rendered yet. */
  const submit = useCallback(
    async (
      images?: SessionImage[],
      options?: { category?: IdentifyTarget; locationChoice?: LocationChoice },
    ) => {
      const s = {
        ...stateRef.current,
        images: images ?? stateRef.current.images,
        // Follow-ups after an automatic result use the group that was detected.
        category:
          options?.category ??
          (stateRef.current.category === 'auto' && stateRef.current.result?.categoryDetection
            ? stateRef.current.result.category
            : stateRef.current.category),
        locationChoice: options?.locationChoice ?? stateRef.current.locationChoice,
      };
      if (options?.category) dispatch({ type: 'setCategory', category: options.category });
      if (options?.locationChoice) {
        dispatch({ type: 'setLocationChoice', choice: options.locationChoice });
      }
      if (s.images.length === 0) return;
      dispatch({ type: 'submitting', phase: 'uploading', fraction: 0, restart: true });
      try {
        const location =
          s.locationChoice === 'photo'
            ? s.photoMeta?.location
            : s.locationChoice === 'none'
              ? undefined
              : await currentLocation();
        const result = await identify(
          {
            observationId: s.observationId,
            category: s.category,
            images: s.images.map((i) => ({ blob: i.blob, feature: i.feature })),
            location,
            locationSource: s.locationChoice === 'photo' && location ? 'photo' : undefined,
            capturedAt: s.capturedAt,
          },
          {
            onStage: (event) => dispatch({ type: 'stage', event }),
            onUploadProgress: (fraction) =>
              dispatch({
                type: 'submitting',
                phase: fraction >= 1 ? 'identifying' : 'uploading',
                fraction,
              }),
          },
        );
        // Let the final checklist tick register before swapping to the result.
        await new Promise((r) => setTimeout(r, RESULT_REVEAL_DELAY_MS));
        dispatch({ type: 'result', result });
        saveToHistory(s.observationId, result, s.images[0], s.capturedAt);
      } catch (error) {
        dispatch({
          type: 'error',
          error:
            error instanceof ClientError
              ? error
              : new ClientError('internal_error', 'Something went wrong. Please try again.'),
        });
      }
    },
    [currentLocation],
  );

  const confirmCrop = useCallback(
    async (box: Box, feature: FeatureId) => {
      const pending = stateRef.current.pending;
      if (!pending) return;
      dispatch({ type: 'submitting', phase: 'preparing', fraction: 0, restart: true });
      let image: SessionImage;
      try {
        const { blob } = await cropAndEncode(pending.blob, box);
        // Keep the original (same object URL as the crop preview) for the full-screen viewer.
        image = { id: newId(), blob, url: URL.createObjectURL(blob), feature, original: pending };
      } catch {
        dispatch({
          type: 'error',
          error: new ClientError(
            'invalid_file',
            'We couldn’t read that photo. Try a different one.',
          ),
        });
        return;
      }
      dispatch({ type: 'addImage', image });
      await submit([...stateRef.current.images, image]);
    },
    [submit],
  );

  const adoptResult = useCallback(
    (image: SessionImage, result: IdentifyResponse, capturedAt: Date) => {
      dispatch({ type: 'adopt', image, result, capturedAt });
      saveToHistory(result.requestId, result, image, capturedAt);
    },
    [],
  );

  const api = useMemo<SessionApi>(
    () => ({
      state,
      adoptResult,
      setCategory: (category) => dispatch({ type: 'setCategory', category }),
      startWithPhoto: (blob, source = 'camera') => {
        // Each new photo starts on Auto; "What is it?" is chosen on the crop screen.
        dispatch({ type: 'reset', category: CLIENT_DEFAULT_TARGET });
        dispatch({ type: 'photo', blob, url: URL.createObjectURL(blob), source });
        if (source === 'library') void inspectLibraryPhoto(blob);
      },
      startFollowUp: (feature) => dispatch({ type: 'setPendingFeature', feature }),
      photoSelected: (blob, source = 'camera') => {
        const first = stateRef.current.images.length === 0;
        dispatch({ type: 'photo', blob, url: URL.createObjectURL(blob), source });
        if (first && source === 'library') void inspectLibraryPhoto(blob);
      },
      setLocationChoice: (choice) => dispatch({ type: 'setLocationChoice', choice }),
      cancelCapture: () => dispatch({ type: 'cancelCapture' }),
      confirmCrop,
      removeImage: (id) => dispatch({ type: 'removeImage', id }),
      submit,
      reset: () => dispatch({ type: 'reset', category: stateRef.current.category }),
      canAddMore: state.images.length < UPLOAD.maxImages,
    }),
    [state, confirmCrop, submit, adoptResult],
  );

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
