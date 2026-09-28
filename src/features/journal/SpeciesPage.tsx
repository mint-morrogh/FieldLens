import { useMemo } from 'react';
import { routeHref } from '../../app/router';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Icon } from '../../components/Icon';
import { Card, ExternalLink, Notice } from '../../components/ui';
import { MONTHS_SHORT, displayName, formatDate, titleCase } from '../../lib/format';
import { useAreaSize } from '../../lib/units';
import { useObjectUrl, useObservations } from '../history/HistoryScreen';
import type { ObservationRecord } from '../history/historyStore';
import { JOURNAL_GROUPS, SEASONS, speciesEntries, speciesPage, type SpeciesPage } from './journal';

function SightingThumb({ record }: { record: ObservationRecord }) {
  const url = useObjectUrl(record.thumbnail ?? record.photo);
  return (
    <li>
      <a
        href={routeHref({ name: 'observation', id: record.id })}
        className="block overflow-hidden rounded-xl border border-line bg-card"
        aria-label={`Sighting on ${formatDate(record.createdAt)}`}
      >
        {url ? (
          <img src={url} alt="" className="aspect-square w-full object-cover" />
        ) : (
          <span className="flex aspect-square w-full items-center justify-center bg-moss-soft text-moss">
            <Icon name="leaf" className="h-6 w-6" />
          </span>
        )}
        <span className="block truncate px-1.5 py-1 text-center text-[0.7rem] text-ink-muted">
          {new Date(record.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </a>
    </li>
  );
}

function Hero({ page }: { page: SpeciesPage }) {
  const { entry } = page;
  const latest = entry.records[0];
  const url = useObjectUrl(latest.photo ?? latest.thumbnail);
  const group = JOURNAL_GROUPS.find((g) => g.id === entry.group)?.label;
  return (
    <header className="pt-2">
      {url && (
        <img
          src={url}
          alt={`Your photo of ${displayName(entry)}`}
          className="mb-4 aspect-[4/3] w-full rounded-[var(--radius-card)] object-cover"
        />
      )}
      <p className="readout flex items-center gap-1.5 text-[0.7rem] font-semibold text-ink-muted">
        <CategoryIcon id={entry.group} className="h-4 w-4" />
        {group}
        {entry.family ? ` · ${entry.family}` : ''}
      </p>
      <h1 className="mt-1 font-serif text-3xl font-bold leading-tight">{displayName(entry)}</h1>
      <p className="sci text-lg text-ink-soft">{entry.scientificName}</p>
    </header>
  );
}

function PageProgress({ page }: { page: SpeciesPage }) {
  const pct = Math.round(page.completion * 100);
  return (
    <Card as="section" aria-labelledby="page-progress-title" data-testid="page-progress">
      <p className="readout text-[0.7rem] font-semibold text-ink-muted">Journal page</p>
      <h2 id="page-progress-title" className="mt-1 text-lg font-bold">
        {pct === 100 ? 'Page complete' : `${pct}% filled in`}
      </h2>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-paper-deep"
        role="progressbar"
        aria-label="Journal page filled in"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="h-full rounded-full bg-moss transition-[width] duration-700"
          style={{ width: `${Math.max(3, pct)}%` }}
        />
      </div>
      <ul className="mt-3 space-y-1.5">
        {page.milestones.map((m) => (
          <li
            key={m.id}
            className={`flex items-center gap-2 ${m.done ? '' : 'text-ink-muted'}`}
            data-done={m.done || undefined}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                m.done ? 'border-moss bg-moss text-on-accent' : 'border-dashed border-line'
              }`}
              aria-hidden
            >
              {m.done && <Icon name="check" className="h-3.5 w-3.5" />}
            </span>
            {m.label}
            <span className="sr-only">{m.done ? '(done)' : '(not yet)'}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-muted">
        Completing a page is about knowing a species: see it again, in other seasons and places, and
        photograph its different parts.
      </p>
    </Card>
  );
}

function Details({ page }: { page: SpeciesPage }) {
  const { entry } = page;
  const areaSize = useAreaSize();
  const firstRecord = entry.records.at(-1)!;
  const max = Math.max(...page.months);
  return (
    <Card as="section" aria-labelledby="sightings-title">
      <p className="readout text-[0.7rem] font-semibold text-ink-muted">Your sightings</p>
      <h2 id="sightings-title" className="mb-3 text-lg font-bold">
        {entry.records.length} {entry.records.length === 1 ? 'sighting' : 'sightings'}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[0.95rem]">
        <dt className="text-ink-muted">First seen</dt>
        <dd>
          {formatDate(entry.firstSeen)}
          {firstRecord.locationLabel ? ` · ~${firstRecord.locationLabel}` : ''}
        </dd>
        {entry.records.length > 1 && (
          <>
            <dt className="text-ink-muted">Last seen</dt>
            <dd>{formatDate(entry.records[0].createdAt)}</dd>
          </>
        )}
        <dt className="text-ink-muted">Places</dt>
        <dd>
          {page.places.length
            ? `${page.places.length} (each about ${areaSize} across)`
            : 'No location'}
        </dd>
      </dl>

      <h3 className="mt-4 text-sm font-semibold">Seasons</h3>
      <ul className="mt-1.5 grid grid-cols-4 gap-1.5" aria-label="Seasons seen">
        {SEASONS.map((s) => {
          const seen = page.seasons.includes(s);
          return (
            <li
              key={s}
              className={`rounded-lg px-1 py-1.5 text-center text-sm ${
                seen ? 'bg-moss-soft font-semibold text-moss-dark' : 'bg-paper-deep text-ink-muted'
              }`}
            >
              {titleCase(s)}
              <span className="sr-only">{seen ? ': seen' : ': not yet'}</span>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-4 text-sm font-semibold">Months</h3>
      <div
        className="mt-1.5 grid grid-cols-12 gap-0.5"
        role="img"
        aria-label={`Seen in ${
          MONTHS_SHORT.filter((_, i) => page.months[i] > 0).join(', ') || 'no months yet'
        }`}
      >
        {page.months.map((count, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <span
              className={`h-6 w-full rounded-sm ${count ? 'bg-moss' : 'bg-paper-deep'}`}
              style={count ? { opacity: 0.45 + 0.55 * (count / max) } : undefined}
            />
            <span className="text-[0.6rem] text-ink-muted">{MONTHS_SHORT[i][0]}</span>
          </div>
        ))}
      </div>

      {page.parts.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold">Parts photographed</h3>
          <ul className="mt-1.5 flex flex-wrap gap-1.5" data-testid="parts">
            {page.parts.map((p) => (
              <li
                key={p.id}
                className={`rounded-full border px-3 py-1 text-sm ${
                  p.have
                    ? 'border-moss bg-moss-soft font-semibold text-moss-dark'
                    : 'border-dashed border-line text-ink-muted'
                }`}
                data-have={p.have || undefined}
              >
                {p.label}
                <span className="sr-only">{p.have ? ': photographed' : ': not yet'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-ink-muted">
            Choose the part on the crop screen when you take a photo. Each new part of a confident
            species earns a point.
          </p>
        </>
      )}
    </Card>
  );
}

/** A species' Field Journal page, filling in as you log it more. */
export function SpeciesPageScreen({ speciesKey }: { speciesKey: string }) {
  const { records, failed } = useObservations();
  const page = useMemo(() => {
    const entry = speciesEntries(records ?? []).find(
      (e) => e.scientificName.toLowerCase() === speciesKey,
    );
    return entry && speciesPage(entry);
  }, [records, speciesKey]);

  if (!records) return <div className="skeleton mt-4 h-64" aria-label="Loading" />;
  if (!page) {
    return (
      <Notice tone="warn" role="alert">
        {failed
          ? 'Local storage isn’t available in this browser, so the journal can’t be shown.'
          : 'This species isn’t in your journal.'}{' '}
        <a href="#/history" className="font-semibold underline">
          Back to the journal
        </a>
      </Notice>
    );
  }
  const summary = page.entry.records.find((r) => r.result?.speciesInfo?.summary)?.result.speciesInfo
    ?.summary;

  return (
    <div className="space-y-4" data-testid="species-page">
      <a
        href="#/history"
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-moss"
      >
        <Icon name="back" className="h-4 w-4" /> Field Journal
      </a>
      <Hero page={page} />
      <PageProgress page={page} />
      <Details page={page} />
      {summary && (
        <Card as="section" aria-label="About this species">
          <p className="text-ink-soft">{summary.text}</p>
          <p className="mt-2 text-xs text-ink-muted">
            — <ExternalLink href={summary.sourceUrl}>{summary.source}</ExternalLink>,{' '}
            {summary.license}
          </p>
        </Card>
      )}
      <section aria-labelledby="gallery-title">
        <h2 id="gallery-title" className="readout mb-2 text-[0.7rem] font-semibold text-ink-muted">
          All sightings
        </h2>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {page.entry.records.map((r) => (
            <SightingThumb key={r.id} record={r} />
          ))}
        </ul>
      </section>
    </div>
  );
}
