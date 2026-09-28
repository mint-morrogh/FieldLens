import { useEffect, useMemo, useState } from 'react';
import type { WhatsOutResponse } from '../../../shared/nearby';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Icon } from '../../components/Icon';
import { coarseLocation, getWhatsOut } from '../../lib/nearby';
import { useObservations } from '../history/HistoryScreen';
import { useLocationState } from '../location/LocationContext';
import { speciesEntries } from './journal';
import {
  dismissWhatsOut,
  isWhatsOutDismissed,
  localDateKey,
  pickWhatsOut,
  whatsOutCopy,
  whatsOutName,
} from './nearby';

/**
 * Daily "What's out now": one species at its seasonal peak near you, as a quiet
 * suggestion. Hidden without a location, while loading, offline, or once dismissed today.
 */
export function WhatsOutCard() {
  const { location } = useLocationState();
  const { records } = useObservations();
  const today = localDateKey(new Date());
  const month = Number(today.slice(5, 7));
  const [dismissed, setDismissed] = useState(() => isWhatsOutDismissed(today));
  const cell = location && coarseLocation(location);
  const lat = cell?.latitude;
  const lon = cell?.longitude;
  const key = `${lat},${lon}:${month}`;
  const [data, setData] = useState<{ key: string; response?: WhatsOutResponse }>();

  useEffect(() => {
    if (lat === undefined || lon === undefined || dismissed) return;
    let cancelled = false;
    void getWhatsOut({ latitude: lat, longitude: lon }, month).then((response) => {
      if (!cancelled) setData({ key, response });
    });
    return () => {
      cancelled = true;
    };
  }, [key, lat, lon, month, dismissed]);

  const entries = useMemo(() => speciesEntries(records ?? []), [records]);
  const response = data?.key === key ? data.response : undefined;
  const pick = useMemo(
    () => (response && records ? pickWhatsOut(response.species, entries, today) : undefined),
    [response, records, entries, today],
  );

  if (!cell || dismissed || !pick) return null;
  const { headline, hint } = whatsOutCopy(pick);
  const photo = pick.species.photo;
  return (
    <aside
      className="flex items-start gap-3 rounded-2xl border border-line bg-card p-3"
      aria-label="What’s out now"
      data-testid="whats-out"
    >
      {photo ? (
        <img
          src={photo.url}
          alt={whatsOutName(pick.species)}
          title={photo.author ?? photo.source}
          loading="lazy"
          decoding="async"
          className="h-14 w-14 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-moss-soft">
          <CategoryIcon id={pick.species.group} className="h-7 w-7 text-moss" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="readout text-[0.7rem] font-semibold text-ink-muted">What’s out now</p>
        <p className="font-bold leading-snug">{headline}</p>
        <p className="text-sm text-ink-soft">{hint}</p>
        {pick.species.commonName && (
          <p className="sci truncate text-xs text-ink-muted">{pick.species.scientificName}</p>
        )}
        {photo && (
          <p className="truncate text-[0.65rem] text-ink-muted">
            Photo: {photo.author ?? photo.source}
          </p>
        )}
      </div>
      <button
        type="button"
        className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted"
        aria-label="Hide for today"
        onClick={() => {
          dismissWhatsOut(today);
          setDismissed(true);
        }}
      >
        <Icon name="close" className="h-4.5 w-4.5" />
      </button>
    </aside>
  );
}
