import type {
  NearbyFamiliesRequest,
  NearbyFamiliesResponse,
  WhatsOutSpecies,
} from '../../../shared/nearby';
import type { ApproxLocation } from '../../../shared/types';
import type { ObservationRecord } from '../history/historyStore';
import { NEARBY } from '../../../shared/nearby';
import { parseLocationLabel, type FamilyTree, type SpeciesEntry, type Stamp } from './journal';

/**
 * "Near you" extras for the journal and home screen, as pure functions. The counts are
 * GBIF occurrence records — how often people log things — and are never shown as rarity.
 */

/** Where "near you" means: the device's coarse location, else the most recent find's. */
export function nearbyLocation(
  device: ApproxLocation | undefined,
  records: ObservationRecord[] | undefined,
): ApproxLocation | undefined {
  if (device) return device;
  const latest = [...(records ?? [])]
    .filter((r) => r.locationLabel)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return parseLocationLabel(latest?.locationLabel);
}

const TAXON_NAME = /^[A-Za-z][A-Za-z-]*$/;

/** The families (or genera) to ask about: the biggest ones first, as many as a request allows. */
export function nearbyTaxa(trees: FamilyTree[]): NearbyFamiliesRequest['taxa'] {
  return trees
    .filter((t) => TAXON_NAME.test(t.name))
    .slice(0, NEARBY.maxTaxa)
    .map((t) => ({ name: t.name, rank: t.rank, group: t.group }));
}

export type NearbyCounts = Map<string, { species: number; capped?: boolean }>;

function treeKey(rank: string, name: string): string {
  return `${rank}:${name.toLowerCase()}`;
}

export function toNearbyCounts(
  response: NearbyFamiliesResponse | undefined,
): NearbyCounts | undefined {
  if (!response) return undefined;
  return new Map(
    response.results.map((r) => [
      treeKey(r.rank, r.name),
      { species: r.species, capped: r.capped },
    ]),
  );
}

/** "3 of 12 recorded near you", or undefined when there's no count for this family. */
export function nearbyLabel(
  tree: FamilyTree,
  counts: NearbyCounts | undefined,
): string | undefined {
  const count = counts?.get(treeKey(tree.rank, tree.name));
  if (!count || count.species === 0) return undefined;
  const have = tree.entries.length;
  // Your own finds count even when nobody has logged them nearby yet.
  const total = Math.max(count.species, have);
  return `${have} of ${total}${count.capped ? '+' : ''} recorded near you`;
}

/** Family stamps with their "recorded near you" note, when the counts are known. */
export function withNearbyNotes(
  stamps: Stamp[],
  trees: FamilyTree[],
  counts: NearbyCounts | undefined,
): Stamp[] {
  if (!counts) return stamps;
  return stamps.map((s) => {
    if (s.id !== 'family' || !s.subject) return s;
    const tree = trees.find((t) => t.name === s.subject);
    const label = tree && nearbyLabel(tree, counts);
    return label ? { ...s, note: `${s.subject}: ${label}` } : s;
  });
}

// ---------------------------------------------------------------------------
// "What's out now": one species a day, the same all day.

/** The device's local date, "2026-09-28". */
export function localDateKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export type WhatsOutPick = { species: WhatsOutSpecies; inJournal: boolean };

/**
 * Today's species: one not in the journal yet, from the groups the person logs when
 * possible; if everything is already in the journal, one of those (as a "find it again").
 * Deterministic per date, so it doesn't change on every visit.
 */
export function pickWhatsOut(
  species: WhatsOutSpecies[],
  entries: SpeciesEntry[],
  dateKey: string,
): WhatsOutPick | undefined {
  if (species.length === 0) return undefined;
  const logged = new Set(entries.map((e) => e.scientificName.toLowerCase()));
  const groups = new Set<string>(entries.map((e) => e.group));
  const fresh = species.filter((s) => !logged.has(s.scientificName.toLowerCase()));
  const preferred = fresh.filter((s) => groups.has(s.group));
  const pool = preferred.length ? preferred : fresh.length ? fresh : species;
  const pick = pool[hash(dateKey) % pool.length];
  return { species: pick, inJournal: logged.has(pick.scientificName.toLowerCase()) };
}

export function whatsOutName(s: WhatsOutSpecies): string {
  const common = s.commonName?.trim();
  return common ? common.charAt(0).toUpperCase() + common.slice(1) : s.scientificName;
}

export function whatsOutCopy(pick: WhatsOutPick): { headline: string; hint: string } {
  const name = whatsOutName(pick.species);
  return {
    headline: `${name} is at its peak near you.`,
    hint: pick.inJournal
      ? 'It’s already in your journal. Can you find it again?'
      : 'Not in your journal yet. Can you find it?',
  };
}

const DISMISS_KEY = 'fieldlens.whatsOut.dismissed';

export function isWhatsOutDismissed(dateKey: string): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === dateKey;
  } catch {
    return false;
  }
}

export function dismissWhatsOut(dateKey: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, dateKey);
  } catch {
    /* ignore: it just shows again */
  }
}
