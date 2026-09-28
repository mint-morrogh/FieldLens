import { Suspense, lazy } from 'react';
import { formatPercent } from '../../../shared/confidence';
import type {
  ApproxLocation,
  CommunityObservationSummary,
  IdentifyResponse,
  LicensedImage,
  NearbySpeciesGroup,
  OrganismCandidate,
  SpeciesInfo,
} from '../../../shared/types';
import { Icon } from '../../components/Icon';
import { Card, ExternalLink, Notice, SectionTitle } from '../../components/ui';
import { displayName, formatCount, formatDate, plural } from '../../lib/format';
import { ConfidenceMeter } from './ConfidenceMeter';
import { CandidateThumb } from './Gallery';
import { MonthBars } from './MonthBars';

function ImageCredit({ image }: { image: LicensedImage }) {
  return (
    <span className="block text-[0.7rem] leading-tight text-ink-muted">
      {image.author ? `© ${image.author}` : 'Photo'}
      {image.license ? ` · ${image.license}` : ''} · {image.source}
    </span>
  );
}

export function CandidateRow({ candidate, rank }: { candidate: OrganismCandidate; rank: number }) {
  const ref = candidate.referenceImages?.[0];
  return (
    <li className="flex gap-3 py-3" data-testid="candidate">
      <div className="w-16 shrink-0">
        <CandidateThumb images={candidate.referenceImages ?? []} title={displayName(candidate)} />
        {ref && (
          <p className="mt-0.5">
            <ImageCredit image={ref} />
          </p>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-bold leading-snug">
            <span className="sr-only">Candidate {rank}: </span>
            {displayName(candidate)}
          </p>
          <p className="shrink-0 text-lg font-bold tabular-nums">
            {formatPercent(candidate.finalConfidence)}
          </p>
        </div>
        <p className="sci text-ink-soft">{candidate.scientificName}</p>
        <div className="mt-1.5">
          <ConfidenceMeter score={candidate.finalConfidence} compact label="confidence" />
        </div>
        {candidate.links.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-x-3 text-sm">
            {candidate.links.slice(0, 2).map((l) => (
              <ExternalLink key={l.url} href={l.url}>
                {l.label}
              </ExternalLink>
            ))}
          </p>
        )}
      </div>
    </li>
  );
}

export function Alternatives({
  candidates,
  title = 'Other possible matches',
}: {
  candidates: OrganismCandidate[];
  title?: string;
}) {
  if (candidates.length === 0) return null;
  return (
    <Card aria-labelledby="alternatives-title" data-testid="alternatives">
      <SectionTitle id="alternatives-title">{title}</SectionTitle>
      <ol className="divide-y divide-line">
        {candidates.map((c, i) => (
          <CandidateRow key={c.id} candidate={c} rank={i + 2} />
        ))}
      </ol>
    </Card>
  );
}

export function WhyThisMatch({ evidence }: { evidence: IdentifyResponse['evidence'] }) {
  if (!evidence.supports.length && !evidence.uncertainties.length) return null;
  return (
    <Card aria-labelledby="why-title" data-testid="why-this-match">
      <SectionTitle id="why-title">Why this match?</SectionTitle>
      {evidence.supports.length > 0 && (
        <ul className="space-y-1.5">
          {evidence.supports.map((e) => (
            <li key={e.code} className="flex gap-2">
              <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-moss" />
              <span>{e.text}</span>
            </li>
          ))}
        </ul>
      )}
      {evidence.uncertainties.length > 0 && (
        <>
          <p className="mt-4 mb-1.5 text-sm font-bold uppercase tracking-wider text-ink-muted">
            Uncertain
          </p>
          <ul className="space-y-1.5">
            {evidence.uncertainties.map((e) => (
              <li key={e.code} className="flex gap-2">
                <span aria-hidden className="mt-0.5 w-5 shrink-0 text-center font-bold text-amber">
                  •
                </span>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

export function GeographicEvidence({
  candidate,
  result,
}: {
  candidate: OrganismCandidate;
  result: IdentifyResponse;
}) {
  const status = result.sourceStatus.occurrence;
  return (
    <Card aria-labelledby="geo-title" data-testid="geo-evidence">
      <SectionTitle id="geo-title" eyebrow="GBIF records">
        Geographic evidence
      </SectionTitle>
      {!result.location.used ? (
        <p className="text-ink-soft">
          Location not used. Identification is based on the photo alone.
        </p>
      ) : status === 'unavailable' ? (
        <Notice tone="warn">
          Local records are temporarily unavailable, so this result uses the photo alone.
        </Notice>
      ) : candidate.occurrence ? (
        <>
          <p className="mb-3 text-ink-soft">
            Records of <span className="sci">{candidate.scientificName}</span> near{' '}
            {result.location.label ? <>~{result.location.label}</> : 'you'}:
          </p>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {candidate.occurrence.radiusCounts.map((r) => (
              <div key={r.radiusKm} className="rounded-xl bg-paper-deep px-2 py-2">
                <dt className="text-sm text-ink-muted">within {r.radiusKm} km</dt>
                <dd className="text-xl font-bold tabular-nums">{formatCount(r.count)}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="text-ink-soft">No GBIF records could be matched to this name.</p>
      )}
    </Card>
  );
}

export function SpeciesFacts({
  info,
  status,
}: {
  info?: SpeciesInfo;
  status: IdentifyResponse['sourceStatus']['speciesInfo'];
}) {
  const ranks: [string, string | undefined][] = info
    ? [
        ['Kingdom', info.taxonomy.kingdom],
        ['Phylum', info.taxonomy.phylum],
        ['Class', info.taxonomy.className],
        ['Order', info.taxonomy.order],
        ['Family', info.taxonomy.family],
        ['Genus', info.taxonomy.genus],
      ]
    : [];
  const shownRanks = ranks.filter(([, v]) => v);
  return (
    <Card aria-labelledby="facts-title" data-testid="species-facts">
      <SectionTitle id="facts-title" eyebrow="Field guide">
        About this species
      </SectionTitle>
      {status === 'unavailable' && (
        <Notice tone="warn">Species information is temporarily unavailable.</Notice>
      )}
      {info?.summary && (
        <blockquote className="mb-4 border-l-4 border-moss-soft pl-3">
          <p className="text-ink-soft">{info.summary.text}</p>
          <footer className="mt-1 text-sm text-ink-muted">
            — <ExternalLink href={info.summary.sourceUrl}>{info.summary.source}</ExternalLink>,{' '}
            {info.summary.license}
          </footer>
        </blockquote>
      )}
      {info && info.commonNames.length > 1 && (
        <p className="mb-3 text-ink-soft">
          <span className="font-semibold text-ink">Also known as:</span>{' '}
          {info.commonNames.slice(1, 6).join(', ')}
        </p>
      )}
      {shownRanks.length > 0 && (
        <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {shownRanks.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-muted">{label}</dt>
              <dd className={label === 'Genus' ? 'sci' : 'font-medium'}>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {info && info.facts.length > 0 && (
        <dl className="space-y-2 border-t border-line pt-3">
          {info.facts.map((f) => (
            <div key={f.label}>
              <dt className="text-sm text-ink-muted">{f.label}</dt>
              <dd className="font-medium">
                {f.value}{' '}
                <span className="text-xs font-normal text-ink-muted">
                  (
                  {f.sourceUrl ? (
                    <ExternalLink href={f.sourceUrl} className="!font-normal">
                      {f.source}
                    </ExternalLink>
                  ) : (
                    f.source
                  )}
                  )
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {info &&
        !info.summary &&
        info.facts.length === 0 &&
        shownRanks.length === 0 &&
        status !== 'unavailable' && (
          <p className="text-ink-soft">No additional sourced facts were found for this species.</p>
        )}
      {info && info.links.length > 0 && (
        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[0.95rem]">
          {info.links.map((l) => (
            <ExternalLink key={l.url} href={l.url}>
              {l.label}
            </ExternalLink>
          ))}
        </p>
      )}
    </Card>
  );
}

export function INaturalistCard({
  summary,
  status,
  locationUsed,
}: {
  summary?: CommunityObservationSummary;
  status: IdentifyResponse['sourceStatus']['community'];
  locationUsed: boolean;
}) {
  return (
    <aside
      aria-labelledby="inat-title"
      data-testid="inat-card"
      className="rounded-[var(--radius-card)] border-2 border-inat/50 bg-inat-soft p-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center rounded-full bg-inat text-on-accent"
        >
          <Icon name="pin" className="h-5 w-5" />
        </span>
        <h2 id="inat-title" className="text-lg font-bold text-inat-ink">
          From iNaturalist
        </h2>
      </div>

      {status === 'unavailable' || !summary ? (
        <p className="text-ink-soft">iNaturalist information is temporarily unavailable.</p>
      ) : (
        <>
          {locationUsed && summary.nearbyCount !== undefined ? (
            <div className="space-y-1">
              <p className="text-xl font-bold text-ink">
                {plural(summary.nearbyCount, 'observation')} within {summary.radiusKm} km
              </p>
              {summary.recentCount !== undefined && (
                <p className="text-ink-soft">
                  {formatCount(summary.recentCount)} observed in the last {summary.recentDays} days
                </p>
              )}
              {summary.mostRecentDate && (
                <p className="text-ink-soft">Most recent: {formatDate(summary.mostRecentDate)}</p>
              )}
            </div>
          ) : (
            <p className="text-ink-soft">
              {summary.globalCount !== undefined
                ? `${plural(summary.globalCount, 'observation')} worldwide. `
                : ''}
              {locationUsed
                ? 'No nearby information found.'
                : 'Share your location to see nearby observations.'}
            </p>
          )}

          {summary.monthCounts && summary.monthCounts.some((c) => c > 0) && (
            <div className="mt-4">
              <p className="mb-1 text-sm font-semibold text-inat-ink">
                Nearby observations by month
              </p>
              <MonthBars
                counts={summary.monthCounts}
                label="iNaturalist observations nearby by month"
                colorClass="bg-inat"
                highlightMonth={new Date().getMonth()}
              />
            </div>
          )}

          {summary.recentObservations.length > 0 && (
            <ul className="mt-4 space-y-2" aria-label="Recent nearby observations">
              {summary.recentObservations.slice(0, 4).map((o) => (
                <li key={o.id} className="flex items-center gap-3">
                  {o.photo ? (
                    <img
                      src={o.photo.thumbnailUrl ?? o.photo.url}
                      alt={`Observation photo${o.photo.author ? `, ${o.photo.author}` : ''}`}
                      title={o.photo.author}
                      className="h-12 w-12 rounded-lg object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-lg bg-card/60 text-inat-ink"
                      aria-hidden
                    >
                      <Icon name="leaf" className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 text-[0.95rem]">
                    <ExternalLink href={o.url}>
                      {formatDate(o.observedOn) ?? 'Date unknown'}
                    </ExternalLink>
                    <p className="truncate text-sm text-ink-muted">
                      {[
                        o.placeGuess,
                        o.qualityGrade === 'research'
                          ? 'Research grade'
                          : o.qualityGrade === 'needs_id'
                            ? 'Needs ID'
                            : undefined,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            {(summary.exploreUrl ?? summary.taxonUrl) && (
              <a
                href={summary.exploreUrl ?? summary.taxonUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-inat-ink px-4 font-semibold text-on-accent"
              >
                View on iNaturalist <Icon name="external" className="h-4 w-4" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

export function NearbySpeciesSection({
  group,
  pluralNoun,
}: {
  group?: NearbySpeciesGroup;
  pluralNoun: string;
}) {
  if (!group || group.species.length === 0) return null;
  return (
    <Card aria-labelledby="nearby-title" data-testid="nearby-species">
      <SectionTitle id="nearby-title" eyebrow={`Other ${pluralNoun} you may encounter nearby`}>
        {group.label}
      </SectionTitle>
      <p className="mb-2 text-sm text-ink-muted">
        These are not alternative identifications — they are related species with GBIF records
        within {group.radiusKm} km.
      </p>
      <ul className="divide-y divide-line">
        {group.species.map((s) => (
          <li key={s.scientificName} className="flex items-baseline justify-between gap-3 py-2">
            <div className="min-w-0">
              {s.commonName && (
                <p className="font-semibold">
                  {displayName({ commonName: s.commonName, scientificName: s.scientificName })}
                </p>
              )}
              {s.url ? (
                <ExternalLink href={s.url} className="sci !font-normal">
                  {s.scientificName}
                </ExternalLink>
              ) : (
                <p className="sci">{s.scientificName}</p>
              )}
            </div>
            <p className="shrink-0 text-sm text-ink-muted">{plural(s.count, 'record')}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const Globe = lazy(() => import('./Globe'));

/** Worldwide distribution from GBIF on a slowly spinning globe (loaded on demand). */
export function WhereRecorded({
  info,
  userLocation,
  title,
}: {
  info?: SpeciesInfo;
  userLocation?: ApproxLocation;
  title: string;
}) {
  const distribution = info?.distribution;
  if (!distribution || distribution.countries.length === 0) return null;
  return (
    <Card aria-labelledby="where-title" data-testid="where-recorded">
      <SectionTitle id="where-title" eyebrow="GBIF records">
        Where it’s been recorded
      </SectionTitle>
      <Suspense
        fallback={
          <div className="skeleton mx-auto aspect-square w-full max-w-[18rem] rounded-full" />
        }
      >
        <Globe distribution={distribution} userLocation={userLocation} title={title} />
      </Suspense>
    </Card>
  );
}
