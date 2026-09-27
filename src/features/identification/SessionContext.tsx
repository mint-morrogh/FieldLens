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
import { DEFAULT_CATEGORY } from '../../../shared/categories';
import { UPLOAD } from '../../../shared/config';
import type {
  FeatureId,
  IdentifyResponse,
  IdentifyStage,
  OrganismCategory,
  StageEvent,
} from '../../../shared/types';
import { ClientError, identify } from '../../lib/api';
import { newId } from '../../lib/ids';
import { cropAndEncode, makeThumbnail } from '../../lib/image';
import type { Box } from '../crop/cropMath';
import { saveObservation, toRecord } from '../history/historyStore';
import { useLocationState } from '../location/LocationContext';

export type SessionImage = { id: string; blob: Blob; url: string; feature: FeatureId };

export type Step = 'idle' | 'crop' | 'submitting' | 'result' | 'error';

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
  category: OrganismCategory;
  observationId: string;
  capturedAt: Date;
  images: SessionImage[];
  /** Full original photo awaiting a crop; stays on-device. */
  pending?: { blob: Blob; url: string };
  pendingFeature: FeatureId;
  progress: Progress;
  result?: IdentifyResponse;
  previousResult?: IdentifyResponse;
  error?: ClientError;
};

type Action =
  | { type: 'reset'; category: OrganismCategory }
  | { type: 'setCategory'; category: OrganismCategory }
  | { type: 'setPendingFeature'; feature: FeatureId }
  | { type: 'photo'; blob: Blob; url: string }
  | { type: 'cancelCapture' }
  | { type: 'addImage'; image: SessionImage }
  | { type: 'removeImage'; id: string }
  | { type: 'submitting'; phase: Progress['phase']; fraction: number; restart?: boolean }
  | { type: 'stage'; event: StageEvent }
  | { type: 'result'; result: IdentifyResponse }
  | { type: 'error'; error: ClientError };

function freshState(category: OrganismCategory): SessionState {
  return {
    step: 'idle',
    category,
    observationId: newId(),
    capturedAt: new Date(),
    images: [],
    pendingFeature: 'auto',
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
    case 'photo':
      return {
        ...state,
        step: 'crop',
        pending: { blob: action.blob, url: action.url },
        capturedAt: state.images.length === 0 ? new Date() : state.capturedAt,
      };
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
  }
}

type SessionApi = {
  state: SessionState;
  setCategory: (category: OrganismCategory) => void;
  /** Start a fresh session with a newly taken or chosen photo. */
  startWithPhoto: (blob: Blob) => void;
  /** Remember which feature (e.g. flower) the next follow-up photo shows. */
  startFollowUp: (feature: FeatureId) => void;
  photoSelected: (blob: Blob) => void;
  cancelCapture: () => void;
  confirmCrop: (box: Box, feature: FeatureId) => Promise<void>;
  removeImage: (id: string) => void;
  submit: (images?: SessionImage[], options?: { category?: OrganismCategory }) => Promise<void>;
  reset: () => void;
  canAddMore: boolean;
};

const RESULT_REVEAL_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 450;

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sessionReducer, DEFAULT_CATEGORY, freshState);
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
      ...state.images.map((i) => i.url),
      ...(state.pending ? [state.pending.url] : []),
    ]);
    for (const url of urls.current) if (!live.has(url)) URL.revokeObjectURL(url);
    urls.current = live;
  }, [state.images, state.pending]);

  /** `images` overrides state when called right after a dispatch that hasn't rendered yet. */
  const submit = useCallback(
    async (images?: SessionImage[], options?: { category?: OrganismCategory }) => {
      const s = {
        ...stateRef.current,
        images: images ?? stateRef.current.images,
        category: options?.category ?? stateRef.current.category,
      };
      if (options?.category) dispatch({ type: 'setCategory', category: options.category });
      if (s.images.length === 0) return;
      dispatch({ type: 'submitting', phase: 'uploading', fraction: 0, restart: true });
      try {
        const location = await currentLocation();
        const result = await identify(
          {
            observationId: s.observationId,
            category: s.category,
            images: s.images.map((i) => ({ blob: i.blob, feature: i.feature })),
            location,
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
        // Save locally (thumbnail + result, never coordinates). Failure here must not affect the result.
        if (result.candidates.length > 0) {
          void makeThumbnail(s.images[0].blob)
            .catch(() => undefined)
            .then((thumb) =>
              saveObservation(toRecord(s.observationId, result, thumb, s.capturedAt)),
            )
            .catch(() => undefined);
        }
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
        image = { id: newId(), blob, url: URL.createObjectURL(blob), feature };
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

  const api = useMemo<SessionApi>(
    () => ({
      state,
      setCategory: (category) => dispatch({ type: 'setCategory', category }),
      startWithPhoto: (blob) => {
        dispatch({ type: 'reset', category: stateRef.current.category });
        dispatch({ type: 'photo', blob, url: URL.createObjectURL(blob) });
      },
      startFollowUp: (feature) => dispatch({ type: 'setPendingFeature', feature }),
      photoSelected: (blob) => dispatch({ type: 'photo', blob, url: URL.createObjectURL(blob) }),
      cancelCapture: () => dispatch({ type: 'cancelCapture' }),
      confirmCrop,
      removeImage: (id) => dispatch({ type: 'removeImage', id }),
      submit,
      reset: () => dispatch({ type: 'reset', category: stateRef.current.category }),
      canAddMore: state.images.length < UPLOAD.maxImages,
    }),
    [state, confirmCrop, submit],
  );

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
