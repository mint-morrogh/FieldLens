import { useHealth } from '../../app/health';
import { navigate } from '../../app/router';
import { CategoryIcon } from '../../components/CategoryIcon';
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
      <label className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-amber">Demo mode</span>
        <span className="text-ink-soft">— photos are not analyzed. Sample result:</span>
        <select
          className="min-h-10 rounded-xl border border-line bg-card px-2"
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

/** Decorative fern frond for the hero (purely visual). */
function FernArt({ className }: { className?: string }) {
  const leaflets = Array.from({ length: 9 }, (_, i) => i);
  return (
    <svg
      viewBox="0 0 120 200"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M60 196C58 140 62 80 88 8" />
      {leaflets.map((i) => {
        const t = i / 9;
        const x = 59 + t * 26;
        const y = 180 - t * 165;
        const len = 34 - t * 22;
        return (
          <g key={i}>
            <path
              d={`M${x} ${y}c-${len * 0.5} -2 -${len} -${len * 0.35} -${len * 1.05} -${len * 0.7}`}
            />
            <path
              d={`M${x + 1.5} ${y - 6}c${len * 0.5} -2 ${len} -${len * 0.3} ${len * 1.1} -${len * 0.65}`}
            />
          </g>
        );
      })}
    </svg>
  );
}

const IDENTIFIES: { id: string; label: string }[] = [
  { id: 'plant', label: 'Plants' },
  { id: 'fungus', label: 'Fungi' },
  { id: 'bug', label: 'Bugs' },
  { id: 'bird', label: 'Birds' },
  { id: 'mammal', label: 'Mammals' },
  { id: 'herp', label: 'Reptiles' },
  { id: 'fish', label: 'Fish' },
];

export function HomeScreen() {
  const session = useSession();
  const health = useHealth();
  const start = (file: File, source: 'camera' | 'library') => {
    session.startWithPhoto(file, source);
    navigate({ name: 'identify' });
  };
  const camera = usePhotoPicker((f) => start(f, 'camera'), { capture: true });
  const picker = usePhotoPicker((f) => start(f, 'library'));
  const covers = IDENTIFIES.filter(
    (c) => !health || c.id === 'plant' || health.autoDetect !== false,
  );

  return (
    <div className="space-y-7">
      <header className="relative -mx-4 overflow-hidden px-4 pb-2 pt-6">
        <FernArt className="pointer-events-none absolute -right-6 -top-4 h-56 w-36 rotate-12 text-moss opacity-[0.13]" />
        <h1 className="relative font-serif text-[2.6rem] font-bold leading-none tracking-tight text-moss-dark">
          {BRAND.name}
        </h1>
        <p className="relative mt-3 max-w-[20rem] text-xl leading-snug text-ink-soft [text-wrap:balance]">
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
        <Button
          size="lg"
          className="min-h-16 text-xl shadow-[0_6px_16px_rgba(47,93,58,0.25)]"
          onClick={camera.open}
        >
          <Icon name="camera" className="h-7 w-7" /> Take a Photo
        </Button>
        <Button size="lg" variant="secondary" className="min-h-14 text-lg" onClick={picker.open}>
          <Icon name="image" className="h-6 w-6" /> Choose Existing Photo
        </Button>
        {camera.input}
        {picker.input}
        {(camera.error ?? picker.error) && (
          <Notice tone="error" role="alert">
            {camera.error ?? picker.error}
          </Notice>
        )}
      </div>

      <section aria-label="What FieldLens can identify" data-testid="identifies">
        <p className="mb-2 text-sm text-ink-muted">
          Just snap it — FieldLens works out what it is:
        </p>
        <ul className="-mx-2 grid grid-cols-7">
          {covers.map((c) => (
            <li key={c.id} className="flex min-w-0 flex-col items-center gap-1 text-center">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full bg-moss-soft text-moss"
                aria-hidden
              >
                <CategoryIcon id={c.id} className="h-5.5 w-5.5" />
              </span>
              <span className="w-full truncate text-[0.7rem] font-medium text-ink-soft">
                {c.label}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <LocationPanel />

      <RecentObservations />
    </div>
  );
}
