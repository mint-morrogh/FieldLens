import { useHealth } from '../../app/health';
import { navigate } from '../../app/router';
import { Icon } from '../../components/Icon';
import { Button, Notice } from '../../components/ui';
import { BRAND } from '../../config/brand';
import { MOCK_SCENARIO_OPTIONS, getMockScenario, setMockScenario } from '../../lib/mockScenario';
import { useState } from 'react';
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

const RECOGNISES: { id: string; label: string }[] = [
  { id: 'plant', label: 'Plants' },
  { id: 'fungus', label: 'Fungi' },
  { id: 'bug', label: 'Insects & spiders' },
  { id: 'bird', label: 'Birds' },
  { id: 'mammal', label: 'Mammals' },
  { id: 'herp', label: 'Reptiles & amphibians' },
  { id: 'fish', label: 'Fish' },
];

/** "46.2°N 63.1°W" — one decimal (~11 km); shown on the device only, never sent like this. */
function coarseCoords(lat: number, lng: number) {
  const f = (v: number, pos: string, neg: string) =>
    `${Math.abs(v).toFixed(1)}°${v >= 0 ? pos : neg}`;
  return `${f(lat, 'N', 'S')} ${f(lng, 'E', 'W')}`;
}

/**
 * The hero: a field viewfinder. The whole panel is the camera button, framed by the
 * same reticle and grid as the crop and analysis screens, with a small status readout.
 */
function Viewfinder({ onCapture }: { onCapture: () => void }) {
  const { status, location } = useLocationState();
  const readout =
    status === 'granted'
      ? location
        ? coarseCoords(location.latitude, location.longitude)
        : 'Location ready'
      : status === 'requesting'
        ? 'Locating…'
        : 'No location';
  return (
    <button
      type="button"
      onClick={onCapture}
      aria-label="Take a Photo"
      className="group relative isolate block w-full overflow-hidden rounded-[1.75rem] bg-toast text-left text-white shadow-[0_18px_40px_-18px_rgba(17,20,15,0.6)] ring-1 ring-white/5 transition-transform duration-200 active:scale-[0.99]"
      data-testid="viewfinder"
    >
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

      <div className="readout flex items-center justify-between px-14 pt-[1.35rem] text-[0.68rem] text-white/60">
        <span className="flex items-center gap-1.5">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#9fd08a]" />
          Ready
        </span>
        <span data-testid="viewfinder-readout">{readout}</span>
      </div>

      <div className="flex flex-col items-center px-6 pb-10 pt-7 text-center">
        <span className="relative flex h-24 w-24 items-center justify-center rounded-full border border-[#9fd08a]/40 transition-transform duration-200 group-hover:scale-105">
          <span className="flex h-18 w-18 items-center justify-center rounded-full bg-[#9fd08a] text-[#10180f] shadow-[0_0_0_6px_rgba(159,208,138,0.12)]">
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
  const covers = RECOGNISES.filter(
    (c) => !health || c.id === 'plant' || health.autoDetect !== false,
  );

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

      <section aria-labelledby="recognises-title" data-testid="identifies">
        <div className="flex items-center gap-3">
          <h2
            id="recognises-title"
            className="readout shrink-0 text-[0.7rem] font-semibold text-ink-muted"
          >
            Recognises
          </h2>
          <span className="h-px flex-1 bg-line" aria-hidden />
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[0.95rem] text-ink-soft">
          {covers.map((c) => (
            <li key={c.id} className="flex items-center gap-2 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full bg-moss/70" aria-hidden />
              {c.label}
            </li>
          ))}
        </ul>
      </section>

      <RecentObservations />
    </div>
  );
}
