import { useEffect, useState } from 'react';
import { CATEGORY_PICKER_ORDER, getTarget, targetMembers } from '../../../shared/categories';
import type { IdentifyTarget, OrganismCategory } from '../../../shared/types';

/** Line illustrations for each organism group (24×24, stroked). */
const CATEGORY_ART: Record<string, string> = {
  plant:
    'M12 21v-9 M12 12c0-4.4 3.1-7.5 8-7.5 0 4.4-3.1 7.5-8 7.5Z M12 15.5c0-3.4-2.6-6-7-6 0 3.4 2.6 6 7 6Z M8 21h8',
  bird: 'M3.5 13.5c2.2 0 4-1 5-3.2L10.3 6.6c1-2.1 4-2.2 5.1-.2l.9 1.6 3.2 1-3.2 1.2c-.2 5.3-4.1 8.6-9 8.6H5l2.8-2.8c-2 0-3.4-.9-4.3-2.5Z M15.2 7.4h.01 M9 19l-1 2.5 M12 18.6l-.5 2.9',
  insect:
    'M12 7.5a3 3 0 0 1 3 3V15a3 3 0 0 1-6 0v-4.5a3 3 0 0 1 3-3Z M12 7.5V5.5 M10.2 4.5 8.8 2.8 M13.8 4.5l1.4-1.7 M9 11H5.5l-1.5-1.5 M9 14.5H5l-1.5 1.5 M15 11h3.5l1.5-1.5 M15 14.5h4l1.5 1.5 M12 10.5V18',
  arachnid:
    'M12 9.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z M12 18.8a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z M10 7.5 6.5 5l-2 1.5 M14 7.5 17.5 5l2 1.5 M9.7 9.2 5.5 9.5 3.5 12 M14.3 9.2l4.2.3 2 2.5 M9.2 14 5 14.5l-1.5 3 M14.8 14l4.2.5 1.5 3 M9.8 17.2 7.5 20.5 M14.2 17.2l2.3 3.3',
  fungus:
    'M3.5 12.5C3.5 7.8 7.3 4 12 4s8.5 3.8 8.5 8.5Z M9.8 12.5v5.3a2.2 2.2 0 0 0 4.4 0v-5.3 M8.5 8.3h.01 M13.5 6.8h.01 M16 9.5h.01',
  mammal:
    'M8 16.8c0-2.4 1.8-4.3 4-4.3s4 1.9 4 4.3c0 1.8-1.4 2.7-4 2.7s-4-.9-4-2.7Z M5.2 11.8a1.5 1.9 0 1 0 3 0 1.5 1.9 0 1 0-3 0Z M8.8 7.6a1.5 1.9 0 1 0 3 0 1.5 1.9 0 1 0-3 0Z M12.2 7.6a1.5 1.9 0 1 0 3 0 1.5 1.9 0 1 0-3 0Z M15.8 11.8a1.5 1.9 0 1 0 3 0 1.5 1.9 0 1 0-3 0Z',
  other:
    'M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9Z M18.5 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z',
};

const ART_ALIASES: Record<string, string> = { bug: 'insect', animal: 'mammal', auto: 'other' };

function CategoryArt({ id, className }: { id: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={CATEGORY_ART[ART_ALIASES[id] ?? id] ?? CATEGORY_ART.other} />
    </svg>
  );
}

/**
 * Tile grid for choosing what to identify. Available groups can be selected;
 * upcoming ones are shown (so people know they're planned) but explain they're
 * coming soon instead of being silently disabled.
 */
export function CategoryPicker({
  value,
  onChange,
  supported,
  autoDetect,
}: {
  value: IdentifyTarget;
  onChange: (id: IdentifyTarget) => void;
  /** Categories the server can identify right now (from /api/health); falls back to the registry. */
  supported?: OrganismCategory[];
  /** Whether the server can work out the category itself ("Not sure"). */
  autoDetect?: boolean;
}) {
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(undefined), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <section aria-labelledby="category-title" data-testid="category-picker">
      <h2 id="category-title" className="mb-3 text-lg font-bold">
        What are you identifying?
      </h2>
      <div role="radiogroup" aria-labelledby="category-title" className="grid grid-cols-3 gap-2.5">
        {CATEGORY_PICKER_ORDER.map((id) => {
          const c = getTarget(id);
          // A group is available when any of its members is; "Not sure" needs server-side detection.
          const available =
            id === 'auto'
              ? (autoDetect ?? !supported)
              : supported
                ? targetMembers(id).some((m) => supported.includes(m))
                : c.available;
          const selected = value === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={!available}
              aria-describedby={`category-${id}-blurb`}
              data-category={id}
              onClick={() =>
                available ? onChange(id) : setNotice(`${c.label} identification is coming soon.`)
              }
              className={`group relative flex min-h-[7.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-1.5 pb-2.5 pt-3 text-center transition ${
                selected
                  ? 'border-moss bg-moss-soft shadow-[0_2px_0_rgba(47,93,58,0.25)]'
                  : available
                    ? 'border-line bg-card hover:border-moss/50 hover:bg-paper-deep active:scale-[0.98]'
                    : 'border-dashed border-line bg-paper-deep/40'
              }`}
            >
              {selected && (
                <span
                  className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-moss text-white"
                  aria-hidden
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12.5 10 17 19 7" />
                  </svg>
                </span>
              )}
              {available && c.experimental && !selected && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-amber-soft px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-amber">
                  Beta
                </span>
              )}
              {!available && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-paper-deep px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-ink-muted">
                  Soon
                </span>
              )}
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
                  selected
                    ? 'bg-moss text-white'
                    : available
                      ? 'bg-moss-soft text-moss group-hover:bg-moss group-hover:text-white'
                      : 'bg-paper-deep text-ink-muted/70'
                }`}
              >
                <CategoryArt id={id} className="h-7 w-7" />
              </span>
              <span
                className={`font-bold leading-tight ${available ? 'text-ink' : 'text-ink-muted'}`}
              >
                {c.label}
              </span>
              <span
                id={`category-${id}-blurb`}
                className="text-[0.72rem] leading-tight text-ink-muted"
              >
                {available ? c.blurb : 'Coming soon'}
              </span>
            </button>
          );
        })}
      </div>
      <p
        className="mt-2 min-h-5 text-center text-sm text-ink-muted"
        role="status"
        aria-live="polite"
      >
        {notice}
      </p>
    </section>
  );
}
