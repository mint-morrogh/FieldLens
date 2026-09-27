import { useEffect, useState } from 'react';
import { CATEGORIES, CATEGORY_PICKER_ORDER } from '../../../shared/categories';
import type { HealthResponse } from '../../../shared/types';
import { navigate } from '../../app/router';
import { Icon } from '../../components/Icon';
import { Button, Chip, Notice } from '../../components/ui';
import { BRAND } from '../../config/brand';
import { MOCK_SCENARIO_OPTIONS, getMockScenario, setMockScenario } from '../../lib/mockScenario';
import { usePhotoPicker } from '../camera/usePhotoPicker';
import { RecentObservations } from '../history/HistoryScreen';
import { useLocationState } from '../location/LocationContext';
import { useSession } from './SessionContext';

export function LocationPanel() {
  const { status, request, decline } = useLocationState();

  if (status === 'granted') {
    return (
      <p className="flex items-center gap-2 text-ink-soft" data-testid="location-status">
        <Icon name="pin" className="h-5 w-5 text-moss" /> Location: Ready
      </p>
    );
  }
  if (status === 'requesting') {
    return (
      <p
        className="flex items-center gap-2 text-ink-soft"
        role="status"
        data-testid="location-status"
      >
        <Icon name="pin" className="h-5 w-5" /> Getting your approximate location…
      </p>
    );
  }
  if (status === 'denied' || status === 'declined' || status === 'unavailable') {
    return (
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-soft"
        data-testid="location-status"
      >
        <span className="flex items-center gap-2">
          <Icon name="pin" className="h-5 w-5" /> Location not used
        </span>
        {(status === 'declined' || status === 'denied') && (
          <button
            type="button"
            className="min-h-11 font-semibold text-moss underline underline-offset-4"
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

export function HomeScreen({ health }: { health?: HealthResponse }) {
  const session = useSession();
  const picker = usePhotoPicker((file) => {
    session.reset();
    session.photoSelected(file);
    navigate({ name: 'identify' });
  });
  const [comingSoon, setComingSoon] = useState<string>();

  useEffect(() => {
    if (!comingSoon) return;
    const t = setTimeout(() => setComingSoon(undefined), 3500);
    return () => clearTimeout(t);
  }, [comingSoon]);

  return (
    <div className="space-y-7">
      <header className="pt-4">
        <h1 className="font-serif text-4xl font-bold tracking-tight text-moss-dark">
          {BRAND.name}
        </h1>
        <p className="mt-2 text-xl text-ink-soft">{BRAND.tagline}</p>
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
          className="min-h-16 text-xl"
          onClick={() => {
            session.startNew();
            navigate({ name: 'identify' });
          }}
        >
          <Icon name="camera" className="h-7 w-7" /> Take a Photo
        </Button>
        <Button size="lg" variant="secondary" className="min-h-16 text-xl" onClick={picker.open}>
          <Icon name="image" className="h-7 w-7" /> Choose Existing Photo
        </Button>
        {picker.input}
        {picker.error && (
          <Notice tone="error" role="alert">
            {picker.error}
          </Notice>
        )}
      </div>

      <fieldset>
        <legend className="mb-2 font-semibold">What are you identifying?</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_PICKER_ORDER.map((id) => {
            const c = CATEGORIES[id];
            return (
              <Chip
                key={id}
                selected={session.state.category === id}
                note={c.available ? undefined : 'Soon'}
                onClick={() =>
                  c.available
                    ? session.setCategory(id)
                    : setComingSoon(`${c.label} identification is coming soon.`)
                }
              >
                {c.label}
              </Chip>
            );
          })}
        </div>
        <p className="mt-2 min-h-6 text-sm text-ink-muted" role="status" aria-live="polite">
          {comingSoon}
        </p>
      </fieldset>

      <LocationPanel />

      <RecentObservations />
    </div>
  );
}
