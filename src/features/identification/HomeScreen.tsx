import { useHealth } from '../../app/health';
import { navigate } from '../../app/router';
import { Icon } from '../../components/Icon';
import { Button, Notice } from '../../components/ui';
import { BRAND } from '../../config/brand';
import { MOCK_SCENARIO_OPTIONS, getMockScenario, setMockScenario } from '../../lib/mockScenario';
import { useEffect, useState } from 'react';
import { usePhotoPicker } from '../camera/usePhotoPicker';
import { RecentObservations } from '../history/HistoryScreen';
import { useLocationState } from '../location/LocationContext';
import { useSession } from './SessionContext';

const PILL = 'inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[0.95rem]';

/** Compact location status; a fuller prompt only before the first decision. */
export function LocationPanel() {
  const { status, request, decline } = useLocationState();

  if (status === 'granted') {
    return (
      <p
        className={`${PILL} border-moss/25 bg-moss-soft text-moss-dark`}
        data-testid="location-status"
      >
        <Icon name="pin" className="h-4.5 w-4.5" /> Location: Ready
      </p>
    );
  }
  if (status === 'requesting') {
    return (
      <p
        className={`${PILL} border-line bg-card text-ink-soft`}
        role="status"
        data-testid="location-status"
      >
        <Icon name="pin" className="h-4.5 w-4.5" /> Getting your approximate location…
      </p>
    );
  }
  if (status === 'denied' || status === 'declined' || status === 'unavailable') {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid="location-status">
        <span className={`${PILL} border-line bg-card text-ink-soft`}>
          <Icon name="pin" className="h-4.5 w-4.5" /> Location not used
        </span>
        {(status === 'declined' || status === 'denied') && (
          <button
            type="button"
            className="min-h-10 px-1 text-[0.95rem] font-semibold text-moss underline underline-offset-4"
            onClick={() => void request()}
          >
            {status === 'denied' ? 'Try again' : 'Use location'}
          </button>
        )}
        {status === 'denied' && (
          <span className="text-sm text-ink-muted">(blocked in browser settings)</span>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-line bg-card p-4" data-testid="location-prompt">
      <p className="flex items-start gap-2 font-medium">
        <Icon name="pin" className="mt-0.5 h-5 w-5 shrink-0 text-moss" />
        Location helps rule out species that are unlikely to occur nearby.
      </p>
      <p className="mt-1 pl-7 text-sm text-ink-muted">
        Only an approximate position (about 1 km) is sent, and it isn’t stored.
      </p>
      <div className="mt-3 flex gap-2 pl-7">
        <Button size="sm" onClick={() => void request()}>
          Allow Location
        </Button>
        <Button size="sm" variant="ghost" onClick={decline}>
          Not Now
        </Button>
      </div>
    </div>
  );
}

function DemoModePanel() {
  const [scenario, setScenario] = useState(getMockScenario() ?? 'high');
  return (
    <div
      className="rounded-2xl border border-dashed border-amber/50 bg-amber-soft/60 p-3 text-sm"
      data-testid="demo-panel"
    >
      <p className="font-semibold text-amber">Demo mode</p>
      <p className="text-ink-soft">Photos aren’t analyzed; you’ll see a sample result.</p>
      <label className="mt-2 flex items-center justify-between gap-3">
        <span className="text-ink-soft">Sample result</span>
        <select
          className="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-card px-2 text-ink sm:max-w-56 sm:flex-none"
          value={scenario}
          onChange={(e) => {
            setScenario(e.target.value);
            setMockScenario(e.target.value);
          }}
        >
          {MOCK_SCENARIO_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** "46.2°N 63.1°W" — one decimal (~11 km); shown on the device only, never sent like this. */
function coarseCoords(lat: number, lng: number) {
  const f = (v: number, pos: string, neg: string) =>
    `${Math.abs(v).toFixed(1)}°${v >= 0 ? pos : neg}`;
  return `${f(lat, 'N', 'S')} ${f(lng, 'E', 'W')}`;
}

/** Openly licensed (CC0) iNaturalist photos, bundled so they work offline. */
const SPECIMENS = ['flower', 'mushroom', 'butterfly', 'bird', 'fox', 'frog', 'fern', 'turtle'];
const SPECIMEN_MS = 4500;

/**
 * Dim, slowly cross-fading photos of living things behind the camera button, so it's
 * obvious what to point the camera at. Still (first photo only) with reduced motion.
 */
function SpecimenBackdrop() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % SPECIMENS.length), SPECIMEN_MS);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute inset-0 -z-20" aria-hidden>
      {SPECIMENS.map((name, i) => (
        <img
          key={name}
          src={`/viewfinder/${name}.webp`}
          alt=""
          loading={i === 0 ? 'eager' : 'lazy'}
          decoding="async"
          className={`specimen absolute inset-0 h-full w-full object-cover transition-opacity duration-[1600ms] ease-in-out ${
            i === index ? 'specimen-active opacity-45' : 'opacity-0'
          }`}
        />
      ))}
      {/* Keeps the grid, reticle and label readable over any photo. */}
      <div className="absolute inset-0 bg-[radial-gradient(90%_75%_at_50%_45%,rgba(17,20,15,0.25),rgba(17,20,15,0.8))]" />
    </div>
  );
}

/** Top-left of the home page: live location status, like an instrument readout. */
export function LocationReadout() {
  const { status, location } = useLocationState();
  const on = status === 'granted';
  const text = on
    ? location
      ? coarseCoords(location.latitude, location.longitude)
      : 'Location on'
    : status === 'requesting'
      ? 'Locating…'
      : 'No location';
  return (
    <span
      className="readout flex min-h-11 items-center gap-2 text-[0.72rem] text-ink-muted"
      data-testid="viewfinder-readout"
      aria-label={on ? `Approximate location ${text}` : text}
    >
      <Icon name="pin" className={`h-4 w-4 ${on ? 'text-moss' : 'text-ink-muted/60'}`} />
      {text}
    </span>
  );
}

/**
 * The hero: a field viewfinder. The whole panel is the camera button, framed by the
 * same reticle and grid as the crop and analysis screens.
 */
function Viewfinder({ onCapture }: { onCapture: () => void }) {
  return (
    <button
      type="button"
      onClick={onCapture}
      aria-label="Take a Photo"
      className="group relative isolate block w-full overflow-hidden rounded-[1.75rem] bg-toast text-left text-white shadow-[0_18px_40px_-18px_rgba(17,20,15,0.6)] ring-1 ring-white/5 transition-transform duration-200 active:scale-[0.99]"
      data-testid="viewfinder"
    >
      <SpecimenBackdrop />
      <div className="scan-grid absolute inset-0 -z-10 opacity-70" aria-hidden />
      <div
        className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_45%,rgba(159,208,138,0.16),transparent_60%)]"
        aria-hidden
      />
      {(
        [
          'left-4 top-4 border-l-2 border-t-2 rounded-tl-lg',
          'right-4 top-4 border-r-2 border-t-2 rounded-tr-lg',
          'bottom-4 left-4 border-b-2 border-l-2 rounded-bl-lg',
          'bottom-4 right-4 border-b-2 border-r-2 rounded-br-lg',
        ] as const
      ).map((c) => (
        <span key={c} className={`reticle absolute h-7 w-7 border-[#9fd08a]/80 ${c}`} aria-hidden />
      ))}

      <div className="flex flex-col items-center px-6 pb-11 pt-11 text-center">
        {/* Shutter: a focus arc sweeps the ring and a soft ripple pulses outward. */}
        <span className="relative flex h-26 w-26 items-center justify-center" aria-hidden>
          <span className="shutter-ripple absolute inset-3 rounded-full border border-[#9fd08a]/60" />
          <span className="absolute inset-0 rounded-full border border-[#9fd08a]/20" />
          <span className="shutter-arc absolute inset-0 rounded-full" />
          <span className="shutter-button relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full text-[#10180f] transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-90">
            <Icon name="camera" className="h-8 w-8" />
          </span>
        </span>
        <span className="mt-4 text-xl font-bold tracking-tight">Take a photo</span>
      </div>
    </button>
  );
}

export function HomeScreen() {
  const session = useSession();
  const health = useHealth();
  const { status } = useLocationState();
  const start = (file: File, source: 'camera' | 'library') => {
    session.startWithPhoto(file, source);
    navigate({ name: 'identify' });
  };
  const camera = usePhotoPicker((f) => start(f, 'camera'), { capture: true });
  const picker = usePhotoPicker((f) => start(f, 'library'));

  return (
    <div className="space-y-6">
      <header className="pt-2">
        <h1 className="font-serif text-[2.35rem] font-bold leading-none tracking-tight text-moss-dark">
          {BRAND.name}
        </h1>
        <p className="mt-2 text-lg leading-snug text-ink-soft [text-wrap:balance]">
          {BRAND.tagline}
        </p>
      </header>

      {health && !health.plantIdentificationConfigured && (
        <Notice tone="warn" role="status">
          Identification isn’t configured on this server yet. You can still explore the app.
        </Notice>
      )}
      {health?.mock && <DemoModePanel />}

      <div className="flex flex-col gap-3">
        <Viewfinder onCapture={camera.open} />
        <Button variant="secondary" className="min-h-13 text-base" onClick={picker.open}>
          <Icon name="image" className="h-5 w-5" /> Choose Existing Photo
        </Button>
        {camera.input}
        {picker.input}
        {(camera.error ?? picker.error) && (
          <Notice tone="error" role="alert">
            {camera.error ?? picker.error}
          </Notice>
        )}
      </div>

      {status !== 'granted' && status !== 'requesting' && <LocationPanel />}

      <RecentObservations />
    </div>
  );
}
