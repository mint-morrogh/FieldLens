import { CATEGORY_PICKER_ORDER, getTarget } from '../../../shared/categories';
import type { IdentifyTarget } from '../../../shared/types';
import { useEffect } from 'react';
import { isTargetAvailable, useHealth } from '../../app/health';
import { navigate } from '../../app/router';
import { Icon } from '../../components/Icon';
import { Button, Card, Notice } from '../../components/ui';
import type { ClientError, ClientErrorCode } from '../../lib/api';
import { useOnline } from '../../lib/useOnline';
import { usePhotoPicker } from '../camera/usePhotoPicker';
import { CropEditor } from '../crop/CropEditor';
import { ResultView } from '../results/ResultView';
import { LocationFixCard } from '../location/LocationFixCard';
import { AnalysisProgress } from './AnalysisProgress';
import { useSession } from './SessionContext';

type ErrorCopy = { title: string; body?: string; retry: boolean };

export function errorCopy(error: ClientError): ErrorCopy {
  const table: Partial<Record<ClientErrorCode, ErrorCopy>> = {
    offline: {
      title: 'You’re offline.',
      body: 'Your photo is still here. Reconnect to identify it.',
      retry: true,
    },
    network: {
      title: 'We couldn’t reach FieldLens.',
      body: 'Your photo is still here. Check your connection and try again.',
      retry: true,
    },
    invalid_file: { title: 'That photo couldn’t be used.', body: error.message, retry: false },
    image_too_large: { title: 'That photo is too large.', body: error.message, retry: false },
    too_many_images: { title: 'Too many photos.', body: error.message, retry: false },
    rate_limited: { title: 'Let’s take a short break.', body: error.message, retry: true },
    provider_quota_exhausted: {
      title: 'The identification service is at capacity.',
      body: error.message,
      retry: true,
    },
    provider_timeout: { title: 'That took too long.', body: error.message, retry: true },
    provider_unavailable: {
      title: 'The identification service is unavailable.',
      body: error.message,
      retry: true,
    },
    provider_auth: {
      title: 'This site isn’t set up correctly.',
      body: error.message,
      retry: false,
    },
    not_configured: {
      title: 'This site isn’t set up for identification yet.',
      body: error.message,
      retry: false,
    },
    unsupported_category: { title: 'Coming soon.', body: error.message, retry: false },
  };
  return table[error.code] ?? { title: 'Something went wrong.', body: error.message, retry: true };
}

function ErrorState({ error }: { error: ClientError }) {
  const session = useSession();
  const online = useOnline();
  const retake = usePhotoPicker((f) => session.startWithPhoto(f, 'camera'), { capture: true });
  const copy = errorCopy(error);
  const last = session.state.images.at(-1);

  // Auto-retry once connectivity returns; the photo was kept in memory.
  useEffect(() => {
    if (error.code === 'offline' && online) void session.submit();
  }, [error.code, online, session]);

  return (
    <Card className="space-y-4" data-testid="error-state">
      {last && (
        <img
          src={last.url}
          alt="Your photo (kept on this device)"
          className="max-h-64 w-full rounded-2xl object-cover"
        />
      )}
      <div className="flex gap-3">
        <Icon
          name={error.code === 'offline' ? 'offline' : 'alert'}
          className="h-7 w-7 shrink-0 text-rust"
        />
        <div role="alert">
          <h1 className="text-xl font-bold">{copy.title}</h1>
          {copy.body && <p className="mt-1 text-ink-soft">{copy.body}</p>}
          {error.retryAfterSeconds && error.code === 'rate_limited' && (
            <p className="mt-1 text-sm text-ink-muted">
              Try again in about {Math.ceil(error.retryAfterSeconds / 60)} minute(s).
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {copy.retry && session.state.images.length > 0 && (
          <Button
            onClick={() => void session.submit()}
            disabled={error.code === 'offline' && !online}
          >
            <Icon name="refresh" className="h-5 w-5" /> Try again
          </Button>
        )}
        {retake.input}
        <Button variant="secondary" onClick={retake.open}>
          <Icon name="photo" className="h-5 w-5" /> Take a different photo
        </Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'home' })}>
          Back to home
        </Button>
      </div>
    </Card>
  );
}

export function IdentifyScreen() {
  const session = useSession();
  const health = useHealth();
  const { state } = session;
  // Follow-up photos: the native camera by default, the library as an alternative.
  const camera = usePhotoPicker((f) => session.photoSelected(f, 'camera'), { capture: true });
  const library = usePhotoPicker((f) => session.photoSelected(f, 'library'));
  const newCamera = usePhotoPicker((f) => session.startWithPhoto(f, 'camera'), { capture: true });

  useEffect(() => {
    if (state.step === 'idle') navigate({ name: 'home' }, { replace: true });
  }, [state.step]);

  if (state.step === 'crop' && state.pending) {
    return (
      <CropEditor
        key={state.pending.url}
        imageUrl={state.pending.url}
        category={
          state.category === 'auto' && state.result?.categoryDetection
            ? state.result.category
            : state.category
        }
        initialFeature={state.pendingFeature}
        confirmLabel={state.images.length > 0 ? 'Add photo and identify' : 'Identify'}
        onCancel={() => {
          session.cancelCapture();
          if (!state.result && !state.error) navigate({ name: 'home' });
        }}
        onConfirm={(box, feature) => void session.confirmCrop(box, feature)}
        categoryChoice={
          state.images.length === 0
            ? {
                value: state.category,
                onChange: session.setCategory,
                options: (['auto', ...CATEGORY_PICKER_ORDER] as IdentifyTarget[]).map((id) => ({
                  id,
                  label: id === 'auto' ? 'Auto' : getTarget(id).label,
                  available: isTargetAvailable(id, health),
                })),
              }
            : undefined
        }
        locationQuestion={
          state.photoSource === 'library' && state.images.length === 0
            ? {
                choice: state.locationChoice,
                hasPhotoLocation: !!state.photoMeta?.location,
                onChange: session.setLocationChoice,
              }
            : undefined
        }
      />
    );
  }

  if (state.step === 'submitting') return <AnalysisProgress />;
  if (state.step === 'error' && state.error) return <ErrorState error={state.error} />;

  if (state.step === 'result' && state.result) {
    const result = state.result;
    const prevTop = state.previousResult?.candidates[0];
    const top = result.candidates[0];
    const mixed =
      !!prevTop?.family &&
      !!top?.family &&
      prevTop.family !== top.family &&
      result.imagesSubmitted > (state.previousResult?.imagesSubmitted ?? 0);
    return (
      <>
        {!result.location.used &&
          result.candidates.length > 0 &&
          (state.locationChoice === 'none' ? (
            <p
              className="mb-4 rounded-2xl bg-paper-deep px-4 py-3 text-[0.95rem] text-ink-soft"
              data-testid="location-skipped"
            >
              Location wasn’t used because you said this photo was taken somewhere else.{' '}
              <button
                type="button"
                className="font-semibold text-moss underline underline-offset-4"
                onClick={() => void session.submit(undefined, { locationChoice: 'here' })}
              >
                It was taken near here
              </button>
            </p>
          ) : (
            <div className="mb-4">
              <LocationFixCard
                onRetry={() => void session.submit(undefined, { locationChoice: 'here' })}
              />
            </div>
          ))}
        <ResultView
          result={result}
          photoUrl={state.images[0]?.url}
          userPhotos={state.images.map((i) => i.original?.url ?? i.url)}
          mixedOrganismWarning={mixed}
          onSwitchCategory={(category) => void session.submit(undefined, { category })}
          improve={
            result.call
              ? undefined
              : {
                  photos: state.images.map((i) => ({ id: i.id, url: i.url, feature: i.feature })),
                  canAddMore: session.canAddMore,
                  onAddPhoto: (feature) => {
                    session.startFollowUp(feature);
                    camera.open();
                  },
                  onAddFromLibrary: (feature) => {
                    session.startFollowUp(feature);
                    library.open();
                  },
                  onRemovePhoto: session.removeImage,
                  onResubmit: () => void session.submit(),
                  dirty: state.images.length !== result.imagesSubmitted,
                }
          }
        />
        {result.call && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => navigate({ name: 'listen' })}
            data-testid="listen-again"
          >
            <Icon name="mic" className="h-5 w-5" /> Listen again
          </Button>
        )}
        {camera.input}
        {library.input}
        {newCamera.input}
        {(camera.error ?? library.error ?? newCamera.error) && (
          <Notice tone="error" role="alert">
            {camera.error ?? library.error ?? newCamera.error}
          </Notice>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <Button size="lg" onClick={newCamera.open}>
            <Icon name="photo" className="h-5 w-5" /> Identify something else
          </Button>
          <Button variant="ghost" onClick={() => navigate({ name: 'history' })}>
            <Icon name="history" className="h-5 w-5" /> View history
          </Button>
        </div>
      </>
    );
  }

  return (
    <Notice role="status">
      Nothing to identify yet.{' '}
      <a className="font-semibold text-moss underline" href="#/">
        Go home
      </a>
    </Notice>
  );
}
