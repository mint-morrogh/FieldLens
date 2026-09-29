import { Fragment, useState } from 'react';
import { getCategory, getTarget } from '../../../shared/categories';
import { formatPercent } from '../../../shared/confidence';
import { CANDIDATES } from '../../../shared/config';
import {
  NOT_SURE,
  answersEarnSharpEye,
  contradicts,
  rescoreWithAnswers,
  type Answers,
} from '../../../shared/questions';
import type {
  DecidingView,
  FeatureId,
  FollowUpQuestion,
  GroupSummary,
  IdentifyResponse,
  IdentifyTarget,
  LicensedImage,
  OrganismCategory,
} from '../../../shared/types';
import { Icon } from '../../components/Icon';
import { Button, Card, ExternalLink, Notice, SectionTitle } from '../../components/ui';
import { displayName } from '../../lib/format';
import type { Guess } from '../journal/fieldSkills';
import { ConfidenceMeter } from './ConfidenceMeter';
import { CandidateThumb, Lightbox, ReferenceGallery, mergeImages } from './Gallery';
import { PronounceButton } from './Pronounce';
import { SafetySection } from './SafetySection';
import {
  Alternatives,
  GeographicEvidence,
  INaturalistCard,
  NearbySpeciesSection,
  SpeciesFacts,
  WhereRecorded,
  WhyThisMatch,
} from './sections';

export type ResultPhoto = { id: string; url: string; feature: FeatureId };

export type ImproveProps = {
  photos: ResultPhoto[];
  canAddMore: boolean;
  /** Opens the camera for a follow-up photo of this feature. */
  onAddPhoto: (feature: FeatureId) => void;
  /** Same, but picks from the photo library. */
  onAddFromLibrary?: (feature: FeatureId) => void;
  onRemovePhoto: (id: string) => void;
  onResubmit: () => void;
  dirty: boolean;
};

/** "a goldenrod (Solidago)" or "the genus Solidago" when no common name is known. */
export function groupPhrase(group: GroupSummary): { short: string; full: string } {
  const common = group.commonName?.toLowerCase();
  if (!common) return { short: `the genus ${group.name}`, full: `the genus ${group.name}` };
  const article = /^[aeiou]/.test(common) ? 'an' : 'a';
  return { short: `${article} ${common}`, full: `${article} ${common} (${group.name})` };
}

/** "an insect", "a spider", "a plant" — for sentences about categories. */
export function categoryPhrase(id: IdentifyTarget): string {
  const label = (id === 'arachnid' ? 'spider' : getTarget(id).label).toLowerCase();
  return `${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label}`;
}

/** Pills (e.g. "Plant · detected") and the match-type label on one baseline-aligned row. */
function Eyebrow({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      {children}
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">{text}</p>
    </div>
  );
}

function Headline({
  result,
  photoUrl,
  thumbnailUrl,
  userPhotos,
}: {
  result: IdentifyResponse;
  photoUrl?: string;
  thumbnailUrl?: string;
  userPhotos?: string[];
}) {
  const top = result.candidates[0];
  const image = photoUrl ?? thumbnailUrl;
  const [viewing, setViewing] = useState(false);
  const ownPhotos: LicensedImage[] = (userPhotos?.length ? userPhotos : image ? [image] : []).map(
    (url) => ({ url, source: 'Your photo' }),
  );
  const band = result.confidenceBand;
  const group = result.groupSummary;
  // Other common names (e.g. "swamp maple" for red maple), shown under the scientific name.
  const primary = top?.commonName?.toLowerCase();
  const otherNames = [
    ...new Map(
      [...(result.speciesInfo?.commonNames ?? []), ...(top?.commonNames ?? [])]
        .filter((n) => n && n.toLowerCase() !== primary)
        .map((n) => [n.toLowerCase(), n.toLowerCase()] as const),
    ).values(),
  ].slice(0, 3);
  // Provider reference photos first (they match the model's view), then iNaturalist's.
  const gallery = top
    ? mergeImages(top.referenceImages, result.speciesInfo?.images).slice(0, 12)
    : [];

  const pills = (
    <>
      {result.categoryDetection && result.candidates.length > 0 && (
        <p
          className="inline-flex items-center rounded-full bg-moss-soft px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.14em] text-moss-dark"
          data-testid="detected-category"
        >
          {getCategory(result.categoryDetection.detected).label}
          {result.categoryDetection.requested === 'auto'
            ? (result.categoryDetection.likelihood ?? 1) < 0.5
              ? ' · detected (unsure)'
              : ' · detected'
            : ''}
        </p>
      )}
      {result.sign && result.candidates.length > 0 && (
        <p
          className="inline-flex items-center rounded-full bg-amber-soft px-2.5 py-0.5 text-xs font-bold uppercase tracking-[0.14em] text-ink"
          data-testid="sign-pill"
        >
          From {result.sign === 'track' ? 'tracks' : 'droppings'}
        </p>
      )}
    </>
  );
  const group0 = band === 'low' ? group : undefined;
  /** The match-type label ("Likely match"), shown on one row with the pills above. */
  const eyebrow =
    result.person || (result.categoryCheck && !result.categoryCheck.matchesCategory)
      ? undefined
      : band === 'high'
        ? 'Very likely match'
        : band === 'medium'
          ? 'Likely match'
          : group0
            ? group0.confidence >= 0.8
              ? 'Almost certainly'
              : 'Probably'
            : undefined;
  const hasPills = !!((result.categoryDetection || result.sign) && result.candidates.length > 0);

  return (
    <Card className="overflow-hidden !p-0" as="div">
      {image && (
        <button
          type="button"
          onClick={() => setViewing(true)}
          className="relative block w-full"
          aria-label={
            result.call ? 'View the recording’s spectrogram' : 'View your photo full screen'
          }
          data-testid="own-photo"
        >
          <img
            src={image}
            alt={result.call ? 'Spectrogram of your recording' : 'The photo you submitted'}
            className="max-h-[46vh] w-full bg-paper-deep object-cover"
          />
          <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white">
            Tap to enlarge{ownPhotos.length > 1 ? ` · ${ownPhotos.length} photos` : ''}
          </span>
        </button>
      )}
      {viewing && ownPhotos.length > 0 && (
        <Lightbox
          images={ownPhotos}
          index={0}
          title="Your photo"
          onClose={() => setViewing(false)}
        />
      )}
      <div className="p-5" data-testid="result-headline" data-band={band}>
        {!eyebrow && hasPills && <div className="mb-2 flex flex-wrap gap-2">{pills}</div>}
        {result.person ? (
          <div data-testid="person-result">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">
              <span className="sci normal-case tracking-normal">Homo sapiens</span>
            </p>
            <h1 className="mt-1 text-2xl font-bold">That’s a person!</h1>
            <p className="mt-2 text-ink-soft">
              FieldLens identifies wild plants, fungi and animals, and people aren’t in its field
              guide. To identify something else in the photo, box just that and try again.
            </p>
          </div>
        ) : result.categoryCheck && !result.categoryCheck.matchesCategory ? (
          <>
            <h1 className="text-2xl font-bold">
              This doesn’t look like{' '}
              {categoryPhrase(result.categoryDetection?.requested ?? result.category)}
            </h1>
            <p className="mt-2 text-ink-soft">
              The image model gave it a {formatPercent(result.categoryCheck.likelihood)} chance of
              being {categoryPhrase(result.categoryDetection?.requested ?? result.category)}, so we
              didn’t guess a species.
              {result.categoryCheck.suggestedCategory &&
                ` It looks more like ${categoryPhrase(result.categoryCheck.suggestedCategory)}.`}
            </p>
          </>
        ) : band === 'none' || !top ? (
          <>
            <h1 className="text-2xl font-bold">No match found</h1>
            <p className="mt-2 text-ink-soft">
              {result.call
                ? result.guidance[0]?.message
                : 'We couldn’t find a match for this photo. Make sure the organism fills most of the box and is in focus.'}
            </p>
          </>
        ) : band === 'low' ? (
          <>
            {group ? (
              <>
                <Eyebrow text={eyebrow!}>{pills}</Eyebrow>
                <h1
                  className="mt-1 font-serif text-3xl font-bold leading-tight"
                  data-testid="group-headline"
                >
                  {groupPhrase(group).full.replace(/^./, (c) => c.toUpperCase())}
                </h1>
                <p className="mt-1 text-ink-soft">
                  {formatPercent(group.confidence)} confidence it’s {groupPhrase(group).short},
                  combined across {group.memberCount} {group.name} species. The exact species is
                  uncertain.
                </p>
                <p className="mt-3 font-semibold">Possible species:</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold">We’re not confident enough yet.</h1>
                <p className="mt-1 text-ink-soft">Possible matches:</p>
              </>
            )}
            <ol className="mt-2 space-y-2" data-testid="low-confidence-list">
              {result.candidates.slice(0, CANDIDATES.minAlternativesShown).map((c, idx) => (
                <li key={c.id} className="flex items-center gap-3">
                  <CandidateThumb
                    images={mergeImages(
                      c.referenceImages,
                      idx === 0 ? result.speciesInfo?.images : undefined,
                    )}
                    title={displayName(c)}
                    size="h-12 w-12"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{displayName(c)}</span>{' '}
                    {c.commonName && <span className="sci text-ink-soft">{c.scientificName}</span>}
                  </span>
                  <span className="shrink-0 text-lg font-bold tabular-nums">
                    {formatPercent(c.finalConfidence)}
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <Eyebrow text={eyebrow!}>{pills}</Eyebrow>
            {/* The eyebrow above already says "Likely match"; balanced wrapping keeps long
                names like "Coastal Sweetpepperbush" from splitting awkwardly on phones. */}
            <h1 className="mt-1 font-serif text-3xl font-bold leading-tight [overflow-wrap:anywhere] [text-wrap:balance]">
              {displayName(top)}
            </h1>
            {top.commonName && (
              <p className="sci mt-0.5 text-xl text-ink-soft">{top.scientificName}</p>
            )}
            <PronounceButton commonName={top.commonName} scientificName={top.scientificName} />
            {otherNames.length > 0 && (
              <p className="mt-1 text-[0.95rem] text-ink-soft" data-testid="also-called">
                Also called {otherNames.join(', ')}
              </p>
            )}
            {top.family && (
              <p className="mt-1 text-[0.95rem] text-ink-muted">Family {top.family}</p>
            )}
            <div className="mt-4">
              <ConfidenceMeter
                score={top.finalConfidence}
                label={band === 'high' ? 'identification confidence' : 'confidence'}
              />
            </div>
            {group && (
              <p className="mt-2 text-[0.95rem] text-ink-soft" data-testid="group-line">
                <strong className="text-ink">{formatPercent(group.confidence)}</strong> confident
                it’s {groupPhrase(group).full}.
              </p>
            )}
            {gallery.length > 0 && (
              <div className="mt-5">
                <ReferenceGallery images={gallery} title={displayName(top)} />
              </div>
            )}
          </>
        )}
        {result.sign && result.candidates.length > 0 && (
          <p className="mt-3 text-sm text-ink-soft" data-testid="sign-note">
            {result.sign === 'track' ? 'Tracks' : 'Droppings'} are much harder to identify than the
            animal itself, so treat these as possible matches
            {result.location.used ? ' among mammals recorded near you' : ''}. Several species leave
            similar signs.
          </p>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-muted">
          <Icon name="pin" className="h-4 w-4" />
          {result.location.used
            ? `${result.location.source === 'photo' ? 'Location from photo' : 'Location used'}${result.location.label ? ` (~${result.location.label})` : ''}`
            : 'Location not used'}
          {result.imagesSubmitted > 1 ? ` · ${result.imagesSubmitted} photos` : ''}
        </p>
      </div>
    </Card>
  );
}

function ImproveIdentification({
  result,
  improve,
}: {
  result: IdentifyResponse;
  improve: ImproveProps;
}) {
  const category = getCategory(result.category);
  const band = result.confidenceBand;
  const usedFeatures = new Set(improve.photos.map((p) => p.feature));
  const featureOptions = category.features.filter((f) => f.id !== 'other');

  return (
    <Card
      aria-labelledby="improve-title"
      data-testid="improve"
      className={band === 'high' ? '' : 'border-moss/40'}
    >
      <SectionTitle id="improve-title">
        {band === 'high' ? 'Improve identification' : 'Improve this identification'}
      </SectionTitle>
      {result.guidance.length > 0 && (
        <ul className="mb-3 space-y-1">
          {result.guidance.map((g) => (
            <li key={g.message} className="font-medium text-ink">
              {g.message}
            </li>
          ))}
        </ul>
      )}

      {improve.photos.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label="Photos in this identification">
          {improve.photos.map((p, i) => (
            <li key={p.id} className="relative">
              <img
                src={p.url}
                alt={`Photo ${i + 1}${p.feature !== 'auto' ? ` (${p.feature})` : ''}`}
                className="h-16 w-16 rounded-xl object-cover"
              />
              {improve.photos.length > 1 && (
                <button
                  type="button"
                  onClick={() => improve.onRemovePhoto(p.id)}
                  className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-card shadow"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {improve.canAddMore ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {featureOptions.map((f) => (
            <Button
              key={f.id}
              variant="secondary"
              onClick={() => improve.onAddPhoto(f.id)}
              className="justify-start"
            >
              <Icon name="plus" className="h-5 w-5" /> {f.followUpLabel}
              {usedFeatures.has(f.id) && <span className="sr-only"> (already added)</span>}
            </Button>
          ))}
          {featureOptions.length === 0 && (
            <Button variant="secondary" onClick={() => improve.onAddPhoto('auto')}>
              <Icon name="plus" className="h-5 w-5" /> Add another photo
            </Button>
          )}
        </div>
      ) : (
        <p className="text-ink-soft">You’ve added the maximum number of photos.</p>
      )}
      {improve.canAddMore && improve.onAddFromLibrary && (
        <button
          type="button"
          onClick={() => improve.onAddFromLibrary?.(result.guidance[0]?.feature ?? 'auto')}
          className="mt-2 min-h-11 font-semibold text-moss underline underline-offset-4"
        >
          Choose from photo library instead
        </button>
      )}
      {improve.dirty && (
        <Button className="mt-3 w-full" onClick={improve.onResubmit}>
          <Icon name="refresh" className="h-5 w-5" /> Identify again with these photos
        </Button>
      )}
    </Card>
  );
}

/** The one photo that would settle it, with a button that opens the camera for that part. */
function DecidingViewCard({ view, improve }: { view: DecidingView; improve: ImproveProps }) {
  return (
    <Card aria-labelledby="deciding-title" data-testid="deciding-view" className="border-moss/40">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-moss">The deciding angle</p>
      <h2 id="deciding-title" className="mt-1 text-xl font-bold">
        {view.prompt}
      </h2>
      <p className="mt-1 text-[0.95rem] text-ink-soft">{view.reason}</p>
      {view.source && (
        <p className="mt-1 text-xs text-ink-muted">
          From{' '}
          {view.sourceUrl ? (
            <ExternalLink href={view.sourceUrl} className="!font-normal">
              {view.source}
            </ExternalLink>
          ) : (
            view.source
          )}
        </p>
      )}
      <Button className="mt-3 w-full" onClick={() => improve.onAddPhoto(view.feature)}>
        <Icon name="plus" className="h-5 w-5" /> Add a photo
      </Button>
      {improve.onAddFromLibrary && (
        <button
          type="button"
          onClick={() => improve.onAddFromLibrary?.(view.feature)}
          className="mt-2 min-h-11 font-semibold text-moss underline underline-offset-4"
        >
          Or pick one from your library
        </button>
      )}
    </Card>
  );
}

/** Quiet notes on field skills: a guess that named it, or an added photo or answers that settled it. */
function SkillNotes({
  guess,
  sharpEye,
  confident,
}: {
  guess?: Guess;
  sharpEye?: 'photo' | 'answers';
  confident: boolean;
}) {
  const guessLine =
    guess?.result === 'exact'
      ? confident
        ? 'You called it.'
        : 'Your guess matches the top possibility.'
      : guess?.result === 'close'
        ? 'Close call: you had the genus.'
        : guess?.result === 'group'
          ? 'You had the right group.'
          : undefined;
  if (!guessLine && !sharpEye) return null;
  return (
    <div className="space-y-1 px-1 text-[0.95rem] text-ink-soft" data-testid="skill-notes">
      {guessLine && (
        <p className="flex items-center gap-1.5" data-testid="guess-note">
          <Icon name="check" className="h-4 w-4 text-moss" /> {guessLine}
        </p>
      )}
      {sharpEye && (
        <p className="flex items-center gap-1.5" data-testid="sharp-eye-note">
          <Icon name="check" className="h-4 w-4 text-moss" />{' '}
          {sharpEye === 'answers'
            ? 'Sharp eye: your answers made this confident.'
            : 'Sharp eye: your extra photo made this confident.'}
        </p>
      )}
    </div>
  );
}

/** Optional multiple-choice questions that can separate the likely matches. */
function FollowUpQuestions({
  questions,
  answers,
  onAnswer,
  ruledOut,
}: {
  questions: FollowUpQuestion[];
  answers: Answers;
  onAnswer: (id: FollowUpQuestion['id'], option: string) => void;
  ruledOut: string[];
}) {
  return (
    <Card aria-labelledby="questions-title" data-testid="follow-up-questions">
      <SectionTitle id="questions-title" eyebrow="Optional">
        Help narrow it down
      </SectionTitle>
      <div className="space-y-4">
        {questions.map((q) => (
          <fieldset key={q.id} className="min-w-0">
            <legend className="mb-2 font-semibold">{q.prompt}</legend>
            <div className="flex flex-wrap gap-2">
              {[...q.options, { id: NOT_SURE, label: 'Not sure' }].map((o) => {
                const selected = answers[q.id] === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onAnswer(q.id, o.id)}
                    className={`min-h-10 rounded-full border px-3.5 text-[0.95rem] font-medium transition-colors ${
                      selected
                        ? 'border-moss bg-moss text-on-accent'
                        : 'border-line bg-card text-ink hover:bg-moss-soft'
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      {ruledOut.length > 0 && (
        <p className="mt-4 text-[0.95rem] text-ink-soft" data-testid="ruled-out" role="status">
          Less likely from your answers: {ruledOut.join(', ')}
        </p>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        Compared with recorded traits from{' '}
        {[...new Map(questions.map((q) => [q.source, q.sourceUrl]))].map(([source, url], i) => (
          <Fragment key={source}>
            {i > 0 && ' and '}
            <ExternalLink href={url} className="!font-normal">
              {source}
            </ExternalLink>
          </Fragment>
        ))}
      </p>
    </Card>
  );
}

export function ResultView({
  result: original,
  photoUrl,
  thumbnailUrl,
  userPhotos,
  improve,
  mixedOrganismWarning,
  onSwitchCategory,
  guess,
  sharpEye,
  answers: savedAnswers,
  onAnswers,
}: {
  result: IdentifyResponse;
  photoUrl?: string;
  thumbnailUrl?: string;
  /** Full-resolution versions of the user's photos for the viewer. */
  userPhotos?: string[];
  improve?: ImproveProps;
  mixedOrganismWarning?: boolean;
  /** Re-run the same photos as another category (offered when the photo doesn't match). */
  onSwitchCategory?: (category: OrganismCategory) => void;
  /** "Name it first": the guess made before this result was shown. */
  guess?: Guess;
  /** An added photo turned an uncertain identification into this confident one. */
  sharpEye?: boolean;
  /** Follow-up answers saved earlier for this result (by its requestId). */
  answers?: { requestId: string; answers: Answers };
  /** Called with every change of answer, e.g. to save them on the observation. */
  onAnswers?: (answers: Answers) => void;
}) {
  // Answers belong to one result; a new result starts with none.
  const [answered, setAnswered] = useState<{ id: string; answers: Answers }>(() => ({
    id: original.requestId,
    answers: savedAnswers?.requestId === original.requestId ? savedAnswers.answers : {},
  }));
  const answers = answered.id === original.requestId ? answered.answers : {};
  // Answers that rule rivals down re-score the top match on the device (never above medium).
  const { result, raised } = rescoreWithAnswers(original, answers);
  const answersSharpEye = answersEarnSharpEye(original, result);
  const questions = original.questions ?? [];
  const ruledOut = original.candidates
    .filter((c) => contradicts(c, questions, answers))
    .map((c) => displayName(c));
  const category = getCategory(result.category);
  const [top, ...rest] = result.candidates;
  const band = result.confidenceBand;
  // For low confidence the headline already lists the top candidates; show details for all of them.
  const alternatives = band === 'low' ? result.candidates : rest;

  return (
    <div className="space-y-4" data-testid="result-view">
      {result.mock && (
        <div
          role="alert"
          data-testid="demo-banner"
          className="rounded-2xl border-2 border-amber bg-amber-soft px-4 py-3 text-amber"
        >
          <p className="font-bold">Demo mode — this is not a real identification.</p>
          <p className="mt-0.5 text-[0.95rem] text-ink-soft">
            Your photo was not analyzed. This is sample data used to preview the app.
          </p>
        </div>
      )}
      {result.category === 'fungus' && (
        <div
          role="note"
          data-testid="fungus-warning"
          className="rounded-2xl border-2 border-rust/50 bg-rust-soft px-4 py-3 text-rust"
        >
          <p className="font-bold">Mushroom identification is difficult, even for experts.</p>
          <p className="mt-0.5 text-[0.95rem]">
            Many deadly mushrooms look like edible ones. Never eat a wild mushroom based on this
            app.
          </p>
        </div>
      )}
      <Headline
        result={result}
        photoUrl={photoUrl}
        thumbnailUrl={thumbnailUrl}
        userPhotos={userPhotos}
      />

      {raised && (
        <p className="px-1 text-[0.95rem] text-ink-soft" data-testid="answers-updated">
          Updated from your answers.
        </p>
      )}

      <SkillNotes
        guess={guess}
        sharpEye={answersSharpEye ? 'answers' : sharpEye ? 'photo' : undefined}
        confident={band === 'high' || band === 'medium'}
      />

      {result.categoryCheck?.suggestedCategory &&
        getCategory(result.categoryCheck.suggestedCategory).available &&
        onSwitchCategory && (
          <Card data-testid="category-switch" className="border-moss/40">
            <p className="font-semibold">
              Identify it as {categoryPhrase(result.categoryCheck.suggestedCategory)} instead?
            </p>
            <Button
              className="mt-3 w-full"
              onClick={() => onSwitchCategory(result.categoryCheck!.suggestedCategory!)}
            >
              Identify as {getCategory(result.categoryCheck.suggestedCategory).label.toLowerCase()}
            </Button>
          </Card>
        )}

      {mixedOrganismWarning && (
        <Notice tone="warn" role="alert">
          The new photo points to a different family than before. These photos may show different
          organisms — only combine photos of the same one.
        </Notice>
      )}

      {result.sourceStatus.occurrence === 'unavailable' && result.location.used && (
        <Notice tone="warn">
          Local GBIF records are temporarily unavailable, so confidence is based on the photo alone.
        </Notice>
      )}

      {improve?.canAddMore && original.decidingView && original.confidenceBand !== 'high' && (
        <DecidingViewCard view={original.decidingView} improve={improve} />
      )}

      {questions.length > 0 && original.confidenceBand !== 'high' && (
        <FollowUpQuestions
          questions={questions}
          answers={answers}
          ruledOut={ruledOut}
          onAnswer={(id, option) => {
            const next = { ...answers, [id]: option };
            setAnswered({ id: original.requestId, answers: next });
            onAnswers?.(next);
          }}
        />
      )}

      {improve && band !== 'high' && <ImproveIdentification result={result} improve={improve} />}

      {top && result.safety && (
        <SafetySection safety={result.safety} band={band} category={result.category} />
      )}

      {top && <WhyThisMatch evidence={result.evidence} />}

      {top && (
        <Alternatives
          candidates={alternatives}
          title={band === 'low' ? 'Possible matches in detail' : 'Other possible matches'}
        />
      )}

      {top && band !== 'low' && (
        <SpeciesFacts info={result.speciesInfo} status={result.sourceStatus.speciesInfo} />
      )}

      {top && (
        <WhereRecorded
          info={result.speciesInfo}
          userLocation={result.location.approx}
          title={displayName(top)}
          uncertain={band === 'low'}
        />
      )}

      {top && result.location.used && <GeographicEvidence candidate={top} result={result} />}

      {top && (
        <INaturalistCard
          summary={result.community}
          status={result.sourceStatus.community}
          locationUsed={result.location.used}
        />
      )}

      {top && (
        <NearbySpeciesSection group={result.nearbySpecies} pluralNoun={category.pluralNoun} />
      )}

      {improve && band === 'high' && <ImproveIdentification result={result} improve={improve} />}

      {result.safetyNotice && !result.safety && (
        <Notice tone="info">
          <strong className="font-semibold">Safety: </strong>
          {result.safetyNotice}
        </Notice>
      )}
    </div>
  );
}
