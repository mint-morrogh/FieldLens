import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CATEGORY_PICKER_ORDER,
  PICKER_SECTIONS,
  getTarget,
  isIdentifyTarget,
  type PickerItem,
} from '../../../shared/categories';
import type { IdentifyTarget } from '../../../shared/types';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Icon } from '../../components/Icon';

const RECENT_KEY = 'fieldlens.recentPicks';
const MAX_RECENT = 4;

const NOT_SURE: Required<Pick<PickerItem, 'id' | 'label' | 'blurb'>> = {
  id: 'auto',
  label: 'Not sure',
  blurb: 'FieldLens works it out',
};

type Shown = { id: IdentifyTarget; label: string; blurb: string; keywords: string[] };

function shown(item: PickerItem): Shown {
  if (item.id === 'auto') return { ...NOT_SURE, keywords: [] };
  const def = getTarget(item.id);
  return {
    id: item.id,
    label: item.label ?? def.label,
    blurb: item.blurb ?? def.blurb,
    keywords: [...(item.keywords ?? []), def.label, def.blurb],
  };
}

/** How a pick is named in the sheet (its first appearance), for the closed picker. */
export function pickLabel(id: IdentifyTarget): Shown {
  if (id === 'auto') return shown({ id });
  for (const s of PICKER_SECTIONS) {
    const item = [s.all, ...s.items].find((i) => i?.id === id);
    if (item) return shown(item);
  }
  return shown({ id });
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’'‘\-–—,&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Picks whose names, descriptions or everyday words contain every word typed. */
export function searchPicks(query: string): { item: Shown; section: string }[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const seen = new Set<IdentifyTarget>();
  const out: { item: Shown; section: string }[] = [];
  for (const section of PICKER_SECTIONS) {
    for (const raw of [...(section.all ? [section.all] : []), ...section.items]) {
      if (seen.has(raw.id)) continue;
      const item = shown(raw);
      const haystack = normalize([item.label, item.blurb, ...item.keywords].join(' | '));
      if (words.every((w) => haystack.includes(w))) {
        seen.add(raw.id);
        out.push({ item, section: section.title });
      }
    }
  }
  return out;
}

function readRecent(): IdentifyTarget[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((id): id is IdentifyTarget => isIdentifyTarget(id))
      .filter((id) => id !== 'auto' && CATEGORY_PICKER_ORDER.includes(id))
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function rememberPick(id: IdentifyTarget) {
  if (id === 'auto') return;
  try {
    const next = [id, ...readRecent().filter((r) => r !== id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: recents are a convenience only.
  }
}

/**
 * "What is it?" on the crop sheet: a select-style button that opens a searchable,
 * sectioned sheet. Each section can also be picked whole ("Any bug") for when you know
 * roughly what it is.
 */
export function CategoryPicker({
  value,
  onChange,
  isAvailable,
  onUnavailable,
}: {
  value: IdentifyTarget;
  onChange: (id: IdentifyTarget) => void;
  isAvailable: (id: IdentifyTarget) => boolean;
  onUnavailable: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = pickLabel(value);

  return (
    <div data-testid="crop-category">
      <p className="mb-2 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-white/85">What is it?</span>
        <span className="text-xs text-white/50">
          {value === 'auto' ? 'Telling it helps' : 'Optional'}
        </span>
      </p>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`What is it? ${current.label}`}
        data-testid="category-trigger"
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.07] px-3 text-left transition hover:bg-white/[0.12]"
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            value === 'auto' ? 'bg-white/10 text-white' : 'bg-[#9fd08a] text-[#11140f]'
          }`}
        >
          <CategoryIcon id={value} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{current.label}</span>
          <span className="block truncate text-xs text-white/55">{current.blurb}</span>
        </span>
        <Icon name="chevron" className="h-5 w-5 shrink-0 text-white/60" />
      </button>
      {open && (
        <PickerSheet
          value={value}
          isAvailable={isAvailable}
          onClose={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
          onPick={(item) => {
            if (!isAvailable(item.id)) {
              onUnavailable(item.label);
              return;
            }
            rememberPick(item.id);
            onChange(item.id);
            setOpen(false);
            triggerRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function PickerSheet({
  value,
  isAvailable,
  onClose,
  onPick,
}: {
  value: IdentifyTarget;
  isAvailable: (id: IdentifyTarget) => boolean;
  onClose: () => void;
  onPick: (item: Shown) => void;
}) {
  const titleId = useId();
  const [query, setQuery] = useState('');
  const [entered, setEntered] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [recent] = useState(readRecent);
  const results = useMemo(() => searchPicks(query), [query]);
  const searching = query.trim().length > 0;

  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    panelRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Close only the sheet, not the crop screen underneath.
      e.stopImmediatePropagation();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  }, []);

  const tile = (item: Shown, wide = false) => (
    <PickTile
      key={item.id}
      item={item}
      wide={wide}
      selected={value === item.id}
      available={isAvailable(item.id)}
      onPick={onPick}
    />
  );

  return (
    <div className="fixed inset-0 z-50" data-testid="category-sheet">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 motion-reduce:transition-none ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`absolute inset-x-0 bottom-0 mx-auto flex h-[88dvh] max-w-xl flex-col rounded-t-3xl border-t border-white/10 bg-[#1a1e17] shadow-[0_-16px_40px_rgba(0,0,0,0.45)] outline-none transition-transform duration-300 ease-out motion-reduce:transition-none ${
          entered ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="px-4 pt-2.5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
          <div className="flex items-center gap-3">
            <h2 id={titleId} className="flex-1 text-lg font-semibold">
              What did you photograph?
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"
            >
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>
          <label className="mt-3 flex min-h-12 items-center gap-2 rounded-2xl bg-white/[0.08] px-3 focus-within:ring-2 focus-within:ring-[#9fd08a]">
            <Icon name="search" className="h-5 w-5 shrink-0 text-white/55" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                scrollRef.current?.scrollTo({ top: 0 });
              }}
              placeholder="Try “crab”, “moss” or “ladybug”"
              aria-label="Search kinds of living things"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent py-2 text-base text-white placeholder:text-white/40 focus:outline-none"
            />
          </label>
          {!searching && (
            <nav
              aria-label="Jump to a group"
              className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]"
            >
              {PICKER_SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    document
                      .getElementById(`pick-${s.id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                  className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-sm font-semibold text-white/80"
                >
                  {s.title}
                </button>
              ))}
            </nav>
          )}
        </div>

        <div
          ref={scrollRef}
          className="safe-bottom min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6"
        >
          {searching ? (
            results.length ? (
              <div className="grid grid-cols-2 gap-2 pt-1" data-testid="pick-results">
                {results.map(({ item }) => tile(item))}
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-white/65">
                <p>Nothing called “{query.trim()}” yet.</p>
                <div className="mx-auto mt-4 max-w-xs">{tile(shown({ id: 'auto' }), true)}</div>
              </div>
            )
          ) : (
            <>
              {tile(shown({ id: 'auto' }), true)}
              {recent.length > 0 && (
                <SheetSection id="recent" title="Recent">
                  {recent.map((id) => tile(pickLabel(id)))}
                </SheetSection>
              )}
              {PICKER_SECTIONS.map((s) => (
                <SheetSection
                  key={s.id}
                  id={s.id}
                  title={s.title}
                  lead={s.all ? tile(shown(s.all), true) : undefined}
                >
                  {s.items.map((i) => tile(shown(i)))}
                </SheetSection>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SheetSection({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={`pick-${id}`} aria-labelledby={`pick-${id}-title`} className="scroll-mt-2 pt-4">
      <h3
        id={`pick-${id}-title`}
        className="sticky top-0 z-10 -mx-4 bg-[#1a1e17]/95 px-4 py-2 text-xs font-semibold tracking-wide text-white/55 uppercase backdrop-blur"
      >
        {title}
      </h3>
      {lead && <div className="mb-2">{lead}</div>}
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

function PickTile({
  item,
  wide,
  selected,
  available,
  onPick,
}: {
  item: Shown;
  wide: boolean;
  selected: boolean;
  available: boolean;
  onPick: (item: Shown) => void;
}) {
  const id = useId();
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={!available}
      aria-labelledby={`${id}-l`}
      aria-describedby={`${id}-b`}
      data-pick={item.id}
      onClick={() => onPick(item)}
      className={`flex min-h-[4.5rem] w-full items-center gap-2.5 rounded-2xl border px-2.5 py-2 text-left transition ${
        selected
          ? 'border-[#9fd08a] bg-[#9fd08a]/15'
          : available
            ? 'border-white/10 bg-white/[0.05] hover:bg-white/[0.1]'
            : 'border-dashed border-white/15 opacity-50'
      } ${wide ? 'col-span-2' : ''}`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          selected ? 'bg-[#9fd08a] text-[#11140f]' : 'bg-white/10 text-white'
        }`}
      >
        <CategoryIcon id={item.id} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span id={`${id}-l`} className="block text-[0.95rem] leading-tight font-semibold">
          {item.label}
        </span>
        <span id={`${id}-b`} className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/55">
          {available ? item.blurb : 'Coming soon'}
        </span>
      </span>
      {selected && <Icon name="check" className="h-4.5 w-4.5 shrink-0 text-[#9fd08a]" />}
    </button>
  );
}
