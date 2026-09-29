import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui';
import { detectPlatform, locationUnblockSteps } from '../../lib/platform';
import { useDistance } from '../../lib/units';
import { useLocationState } from './LocationContext';

/**
 * Shown on a result that was identified without location. Explains why it
 * matters and offers a one-tap fix: request location, then re-run the
 * identification. If the browser has location blocked, shows how to unblock it.
 */
export function LocationFixCard({ onRetry }: { onRetry: () => void }) {
  const fine = useDistance(1);
  const { status, request } = useLocationState();
  const [failed, setFailed] = useState(false);
  const blocked = status === 'denied' || failed;
  const help = locationUnblockSteps(detectPlatform());

  const requestAndRetry = async () => {
    const location = await request();
    if (location) onRetry();
    else setFailed(true);
  };

  return (
    <section
      aria-labelledby="location-fix-title"
      data-testid="location-fix"
      className="rounded-[var(--radius-card)] border-2 border-amber/40 bg-amber-soft/60 p-5"
    >
      <div className="flex items-start gap-3">
        <Icon name="pin" className="mt-0.5 h-6 w-6 shrink-0 text-amber" />
        <div className="min-w-0 flex-1">
          <h2 id="location-fix-title" className="font-bold">
            Location wasn’t used for this result
          </h2>
          {blocked ? (
            <>
              <p className="mt-1 text-ink-soft">
                Location is blocked for this site, so nearby records and the iNaturalist card
                couldn’t be checked. To allow it:
              </p>
              <p className="mt-2 text-sm font-bold text-ink" data-testid="unblock-title">
                {help.title}
              </p>
              <ol
                className="mt-1 list-decimal space-y-1 pl-5 text-[0.95rem] text-ink-soft"
                data-testid="unblock-steps"
              >
                {help.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
                <li>Come back here and tap Try again.</li>
              </ol>
            </>
          ) : (
            <p className="mt-1 text-ink-soft">
              Adding your approximate location (about {fine}) checks which species are actually
              recorded near you and fills in the iNaturalist card.
            </p>
          )}
          <Button
            className="mt-3"
            onClick={() => void requestAndRetry()}
            disabled={status === 'requesting'}
          >
            <Icon name="pin" className="h-5 w-5" />
            {status === 'requesting'
              ? 'Getting your location…'
              : blocked
                ? 'Try again'
                : 'Use my location & re-check'}
          </Button>
        </div>
      </div>
    </section>
  );
}
