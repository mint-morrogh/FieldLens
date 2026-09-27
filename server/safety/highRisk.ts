/**
 * Hand-curated safety notes for high-risk plants and mushrooms relevant to
 * Prince Edward Island / North America, plus well-known dangerous look-alikes.
 *
 * Rules for editing this file:
 * - Keep each note short and conservative; it must be supported by the linked page.
 * - Never describe anything as safe to eat.
 * - Prefer genus-level entries when several species in the genus are dangerous.
 */

const wiki = (title: string) => `https://en.wikipedia.org/wiki/${title}`;

export type HighRiskEntry = {
  /** Lower-case genus, or "genus species". */
  taxon: string;
  commonName: string;
  note: string;
  severity: 'deadly' | 'toxic' | 'skin' | 'caution';
  sourceUrl: string;
};

export const HIGH_RISK: HighRiskEntry[] = [
  // Plants
  {
    taxon: 'cicuta',
    commonName: 'water hemlock',
    severity: 'deadly',
    note: 'Water hemlocks are highly poisonous; eating even a small amount can be fatal.',
    sourceUrl: wiki('Cicuta'),
  },
  {
    taxon: 'conium maculatum',
    commonName: 'poison hemlock',
    severity: 'deadly',
    note: 'All parts of poison hemlock are highly poisonous to people and animals.',
    sourceUrl: wiki('Conium_maculatum'),
  },
  {
    taxon: 'actaea',
    commonName: 'baneberry',
    severity: 'toxic',
    note: 'Baneberry plants, including their bright berries, are poisonous.',
    sourceUrl: wiki('Actaea_rubra'),
  },
  {
    taxon: 'taxus',
    commonName: 'yew',
    severity: 'deadly',
    note: 'Almost all parts of yews, including the seed inside the red berry, are poisonous.',
    sourceUrl: wiki('Taxus'),
  },
  {
    taxon: 'solanum dulcamara',
    commonName: 'bittersweet nightshade',
    severity: 'toxic',
    note: 'Bittersweet nightshade is poisonous; its bright red berries are a risk to children.',
    sourceUrl: wiki('Solanum_dulcamara'),
  },
  {
    taxon: 'atropa',
    commonName: 'deadly nightshade',
    severity: 'deadly',
    note: 'Deadly nightshade is highly toxic, including its berries.',
    sourceUrl: wiki('Atropa_belladonna'),
  },
  {
    taxon: 'phytolacca',
    commonName: 'pokeweed',
    severity: 'toxic',
    note: 'Pokeweed is poisonous, especially the roots and berries.',
    sourceUrl: wiki('Phytolacca_americana'),
  },
  {
    taxon: 'menispermum',
    commonName: 'moonseed',
    severity: 'toxic',
    note: 'Moonseed fruit is poisonous and is easily confused with wild grapes.',
    sourceUrl: wiki('Menispermum_canadense'),
  },
  {
    taxon: 'aconitum',
    commonName: 'monkshood',
    severity: 'deadly',
    note: 'Monkshoods are highly poisonous.',
    sourceUrl: wiki('Aconitum'),
  },
  {
    taxon: 'digitalis',
    commonName: 'foxglove',
    severity: 'deadly',
    note: 'Foxglove contains cardiac glycosides and is poisonous.',
    sourceUrl: wiki('Digitalis_purpurea'),
  },
  {
    taxon: 'convallaria',
    commonName: 'lily of the valley',
    severity: 'deadly',
    note: 'All parts of lily of the valley are highly poisonous.',
    sourceUrl: wiki('Convallaria_majalis'),
  },
  {
    taxon: 'veratrum',
    commonName: 'false hellebore',
    severity: 'deadly',
    note: 'False hellebores are highly toxic.',
    sourceUrl: wiki('Veratrum_viride'),
  },
  {
    taxon: 'kalmia',
    commonName: 'laurel (Kalmia)',
    severity: 'toxic',
    note: 'Kalmia laurels are poisonous to people and livestock.',
    sourceUrl: wiki('Kalmia'),
  },
  {
    taxon: 'arisaema',
    commonName: 'jack-in-the-pulpit',
    severity: 'toxic',
    note: 'Raw jack-in-the-pulpit contains calcium oxalate crystals that cause intense burning and swelling.',
    sourceUrl: wiki('Arisaema_triphyllum'),
  },
  {
    taxon: 'toxicodendron',
    commonName: 'poison ivy / poison sumac',
    severity: 'skin',
    note: 'Touching these plants can cause a severe itchy rash (urushiol).',
    sourceUrl: wiki('Toxicodendron_radicans'),
  },
  {
    taxon: 'heracleum mantegazzianum',
    commonName: 'giant hogweed',
    severity: 'skin',
    note: 'Giant hogweed sap can cause serious burns on skin exposed to sunlight.',
    sourceUrl: wiki('Heracleum_mantegazzianum'),
  },
  {
    taxon: 'pastinaca sativa',
    commonName: 'wild parsnip',
    severity: 'skin',
    note: 'Wild parsnip sap can cause burns and blisters on skin exposed to sunlight.',
    sourceUrl: wiki('Pastinaca_sativa'),
  },
  // Mushrooms
  {
    taxon: 'amanita',
    commonName: 'amanitas',
    severity: 'deadly',
    note: 'The genus includes the death cap and destroying angels, responsible for most fatal mushroom poisonings.',
    sourceUrl: wiki('Amanita'),
  },
  {
    taxon: 'galerina',
    commonName: 'galerinas',
    severity: 'deadly',
    note: 'Some Galerina species (e.g. the funeral bell) contain the same deadly toxins as the death cap.',
    sourceUrl: wiki('Galerina_marginata'),
  },
  {
    taxon: 'lepiota',
    commonName: 'lepiotas',
    severity: 'deadly',
    note: 'Several small Lepiota species are deadly poisonous.',
    sourceUrl: wiki('Lepiota'),
  },
  {
    taxon: 'gyromitra',
    commonName: 'false morels',
    severity: 'deadly',
    note: 'False morels contain gyromitrin and can be deadly.',
    sourceUrl: wiki('Gyromitra_esculenta'),
  },
  {
    taxon: 'cortinarius',
    commonName: 'webcaps',
    severity: 'deadly',
    note: 'Some webcaps contain orellanine, which can cause kidney failure days after eating.',
    sourceUrl: wiki('Cortinarius'),
  },
  {
    taxon: 'inocybe',
    commonName: 'fibrecaps',
    severity: 'toxic',
    note: 'Many Inocybe species contain muscarine and are poisonous.',
    sourceUrl: wiki('Inocybe'),
  },
  {
    taxon: 'clitocybe',
    commonName: 'funnel caps',
    severity: 'toxic',
    note: 'Some Clitocybe species contain muscarine and are poisonous.',
    sourceUrl: wiki('Clitocybe'),
  },
  {
    taxon: 'omphalotus',
    commonName: "jack-o'-lantern mushroom",
    severity: 'toxic',
    note: "Jack-o'-lantern mushrooms are poisonous and are often mistaken for chanterelles.",
    sourceUrl: wiki('Omphalotus_illudens'),
  },
  {
    taxon: 'chlorophyllum molybdites',
    commonName: 'green-spored parasol',
    severity: 'toxic',
    note: 'The green-spored parasol is poisonous and can cause serious vomiting and diarrhea.',
    sourceUrl: wiki('Chlorophyllum_molybdites'),
  },
];

/** Edible-looking taxa → dangerous look-alikes worth warning about. Keys: lower-case genus or binomial. */
export const DANGEROUS_LOOKALIKES: Record<string, string[]> = {
  cantharellus: ['omphalotus', 'hygrophoropsis aurantiaca'],
  morchella: ['gyromitra'],
  agaricus: ['amanita'],
  vitis: ['menispermum'],
  'allium tricoccum': ['convallaria', 'veratrum'],
  'daucus carota': ['conium maculatum', 'cicuta'],
  angelica: ['conium maculatum', 'cicuta'],
  'heracleum maximum': ['heracleum mantegazzianum', 'cicuta'],
};

const HYGROPHOROPSIS: HighRiskEntry = {
  taxon: 'hygrophoropsis aurantiaca',
  commonName: 'false chanterelle',
  severity: 'caution',
  note: 'The false chanterelle is easily confused with true chanterelles.',
  sourceUrl: wiki('Hygrophoropsis_aurantiaca'),
};

const ALL_ENTRIES = [...HIGH_RISK, HYGROPHOROPSIS];

/** Find a high-risk entry for a scientific name (species match first, then genus). */
export function findHighRisk(scientificName: string, genus?: string): HighRiskEntry | undefined {
  const name = scientificName.trim().toLowerCase();
  const g = (genus ?? name.split(/\s+/)[0]).toLowerCase();
  return ALL_ENTRIES.find((e) => e.taxon === name) ?? ALL_ENTRIES.find((e) => e.taxon === g);
}

/** Dangerous look-alikes for a taxon, resolved to entries. */
export function findLookalikes(scientificName: string, genus?: string): HighRiskEntry[] {
  const name = scientificName.trim().toLowerCase();
  const g = (genus ?? name.split(/\s+/)[0]).toLowerCase();
  const keys = DANGEROUS_LOOKALIKES[name] ?? DANGEROUS_LOOKALIKES[g] ?? [];
  return keys
    .map(
      (k) =>
        ALL_ENTRIES.find((e) => e.taxon === k) ??
        ALL_ENTRIES.find((e) => e.taxon === k.split(' ')[0]),
    )
    .filter((e): e is HighRiskEntry => !!e);
}
