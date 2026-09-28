import type {
  ConfidenceBand,
  OrganismCategory,
  SafetyInfo,
  SafetyStatement,
} from '../../../shared/types';
import { Icon } from '../../components/Icon';
import { ExternalLink } from '../../components/ui';

const KIND_LABEL: Record<SafetyStatement['kind'], string> = {
  toxic: 'Toxic',
  caution: 'Caution',
  lookalike: 'Dangerous look-alike',
  edible: 'Reported use as food',
};

function Statement({ s }: { s: SafetyStatement }) {
  const tone =
    s.kind === 'edible'
      ? 'border-moss/30 bg-moss-soft/50'
      : s.severity === 'deadly' || (s.kind !== 'caution' && s.severity === 'toxic')
        ? 'border-rust/30 bg-rust-soft/60'
        : 'border-amber/30 bg-amber-soft/50';
  return (
    <li className={`rounded-xl border px-3 py-2.5 ${tone}`} data-kind={s.kind}>
      <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
        {KIND_LABEL[s.kind]}
        {s.subject ? ` · ${s.kind === 'lookalike' ? '' : 'possible match: '}${s.subject}` : ''}
        {s.basis === 'genus' ? ' · genus-level' : ''}
      </p>
      <p className="mt-0.5 text-[0.95rem] text-ink">{s.quote ? `“${s.text}”` : s.text}</p>
      <p className="mt-1 text-xs text-ink-muted">
        {s.sourceUrl ? (
          <ExternalLink href={s.sourceUrl} className="!font-normal">
            {s.source}
          </ExternalLink>
        ) : (
          s.source
        )}
        {s.license ? ` · ${s.license}` : ''}
      </p>
    </li>
  );
}

/** Sourced cautions for animals: disease, bites, and keeping a safe distance. */
function WildlifeSafety({ safety }: { safety: SafetyInfo }) {
  return (
    <section
      aria-labelledby="safety-title"
      data-testid="safety"
      data-kind="wildlife"
      data-level={safety.level}
      className="rounded-[var(--radius-card)] border-2 border-amber/40 bg-card p-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <Icon name="alert" className="h-6 w-6 text-amber" />
        <h2 id="safety-title" className="text-lg font-bold">
          Wildlife safety
        </h2>
      </div>
      <ul className="space-y-2" aria-label="Warnings">
        {safety.statements.map((s, i) => (
          <Statement key={i} s={s} />
        ))}
      </ul>
      <p className="mt-4 border-t border-line pt-3 text-sm font-medium text-ink">
        Never touch or feed wild animals. If you’re bitten or scratched, wash the wound and see a
        doctor right away.
      </p>
    </section>
  );
}

/**
 * Sourced edibility and toxicity notes. Warnings are always shown; food uses are
 * only shown for high-confidence identifications, and never as "safe to eat".
 */
export function SafetySection({
  safety,
  band,
  category,
}: {
  safety: SafetyInfo;
  band: ConfidenceBand;
  category: OrganismCategory;
}) {
  if (safety.kind === 'wildlife') return <WildlifeSafety safety={safety} />;
  const warnings = safety.statements.filter((s) => s.kind !== 'edible');
  const edible = safety.statements.filter((s) => s.kind === 'edible');
  // Food uses only for confident IDs, and never for species reported toxic themselves.
  const showEdible = band === 'high' && !safety.topToxic;
  const fungus = category === 'fungus';

  return (
    <section
      aria-labelledby="safety-title"
      data-testid="safety"
      data-level={safety.level}
      className={`rounded-[var(--radius-card)] border-2 p-5 ${
        safety.level === 'danger'
          ? 'border-rust/50 bg-card'
          : safety.level === 'caution'
            ? 'border-amber/40 bg-card'
            : 'border-line bg-card'
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <Icon
          name="alert"
          className={`h-6 w-6 ${safety.level === 'danger' ? 'text-rust' : safety.level === 'caution' ? 'text-amber' : 'text-ink-muted'}`}
        />
        <h2 id="safety-title" className="text-lg font-bold">
          Edibility &amp; safety
        </h2>
      </div>

      {safety.level === 'danger' && (
        <p className="mb-3 rounded-xl bg-rust px-3 py-2 font-semibold text-white" role="alert">
          {safety.topToxic
            ? 'Reported poisonous. Do not eat any part of it.'
            : 'Dangerous look-alikes or possible matches. Don’t eat it without an expert’s confirmation.'}
        </p>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-2" aria-label="Warnings">
          {warnings.map((s, i) => (
            <Statement key={`w${i}`} s={s} />
          ))}
        </ul>
      )}

      <div className="mt-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
          Reported edible uses
        </h3>
        {edible.length === 0 ? (
          <p className="mt-1 text-ink-soft" data-testid="edible-none">
            No sourced edibility information found. That doesn’t mean it’s safe to eat.
          </p>
        ) : safety.topToxic ? (
          <p className="mt-1 text-ink-soft" data-testid="edible-hidden">
            Not shown because this species is reported poisonous.
          </p>
        ) : !showEdible ? (
          <p className="mt-1 text-ink-soft" data-testid="edible-hidden">
            Hidden because this identification isn’t certain enough. Add more photos to improve it.
          </p>
        ) : (
          <>
            {fungus && (
              <p className="mt-2 rounded-xl border border-rust/40 bg-rust-soft px-3 py-2 text-[0.95rem] font-semibold text-rust">
                Many edible mushrooms have deadly look-alikes. Never eat a wild mushroom unless an
                expert has checked it in person.
              </p>
            )}
            <ul className="mt-2 space-y-2" data-testid="edible-list">
              {edible.map((s, i) => (
                <Statement key={`e${i}`} s={s} />
              ))}
            </ul>
            <p className="mt-2 text-sm text-ink-muted">
              These describe how the species is used — not whether this particular{' '}
              {fungus ? 'mushroom' : 'plant'} is safe. Edibility often depends on the part, ripeness
              and preparation.
            </p>
          </>
        )}
      </div>

      <p className="mt-4 border-t border-line pt-3 text-sm font-medium text-ink">
        Never eat a wild {fungus ? 'mushroom' : 'plant'} based on an app. Confirm with a local
        expert. If someone may have been poisoned, call 911 or your local poison centre.
      </p>
    </section>
  );
}
