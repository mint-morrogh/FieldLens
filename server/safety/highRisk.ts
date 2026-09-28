/**
 * Hand-curated safety notes for high-risk plants and mushrooms relevant to
 * Prince Edward Island / North America, plus well-known dangerous look-alikes.
 *
 * Rules for editing this file:
 * - Keep each note short and conservative; it must be supported by the linked page.
 * - Never describe anything as safe to eat.
 * - Prefer genus-level entries when several species in the genus are dangerous.
 * - Species entries take precedence over the genus entry, so a species note can be
 *   more specific (and better sourced) than its genus note.
 * - Prefer poison centres, health agencies, extension services, mycological
 *   societies and peer-reviewed toxicology over Wikipedia; set `source` when the
 *   page isn't Wikipedia. Non-Wikipedia sources checked 2026-09-28.
 */

const wiki = (title: string) => `https://en.wikipedia.org/wiki/${title}`;

export type HighRiskEntry = {
  /** Lower-case genus, or "genus species". */
  taxon: string;
  commonName: string;
  note: string;
  severity: 'deadly' | 'toxic' | 'skin' | 'caution';
  /** Publisher and page, when the source isn't Wikipedia. */
  source?: string;
  sourceUrl: string;
};

const pubmed = (id: string) => `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
const pmc = (id: string) => `https://pmc.ncbi.nlm.nih.gov/articles/${id}/`;
const CDC_AMANITA_2026 = {
  source: 'CDC MMWR — Amanita species mushroom poisonings, Northern California, 2025–2026',
  sourceUrl: 'https://www.cdc.gov/mmwr/volumes/75/wr/mm7520a2.htm',
};
const BAMS_AMATOXIN = {
  source: 'Bay Area Mycological Society — Amatoxin poisonings',
  sourceUrl: 'https://bayareamushrooms.org/poisonings/amatoxin.html',
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
  {
    taxon: 'oenanthe crocata',
    commonName: 'hemlock water dropwort',
    severity: 'deadly',
    note: 'Hemlock water dropwort is probably the most poisonous plant in the British Isles. The roots are the most toxic part and have been eaten by mistake for the roots of other plants, often with fatal results.',
    source: 'Clinical Toxicology — Hemlock water dropwort poisoning: a review (1978)',
    sourceUrl: pubmed('657757'),
  },
  {
    taxon: 'colchicum autumnale',
    commonName: 'autumn crocus',
    severity: 'deadly',
    note: 'All parts of autumn crocus are poisonous (colchicine). Its spring leaves are most often confused with wild garlic, and poisonings have been fatal. Check that every leaf smells of garlic when rubbed; if in any doubt, don’t eat it.',
    source: 'ANSES (French food safety agency) — Confusion between autumn crocus and wild garlic',
    sourceUrl:
      'https://www.anses.fr/en/content/confusion-between-autumn-crocus-and-wild-garlic-can-lead-fatal-poisoning',
  },
  {
    taxon: 'ricinus',
    commonName: 'castor bean',
    severity: 'deadly',
    note: 'Every part of the castor bean plant is poisonous if eaten. The seeds contain ricin and eating only a few can be fatal; handling the leaves can cause severe skin reactions.',
    source: 'NC State Extension — Ricinus communis',
    sourceUrl: 'https://plants.ces.ncsu.edu/plants/ricinus-communis/',
  },
  {
    taxon: 'nerium',
    commonName: 'oleander',
    severity: 'deadly',
    note: 'All parts of oleander — flowers, leaves, stems and twigs — are poisonous and can cause a slow or irregular heartbeat.',
    source: 'MedlinePlus — Oleander poisoning',
    sourceUrl: 'https://medlineplus.gov/ency/article/002884.htm',
  },
  {
    taxon: 'datura stramonium',
    commonName: 'jimsonweed / thorn apple',
    severity: 'toxic',
    note: 'All parts of jimsonweed are poisonous, especially the leaves and seeds. Poisoning can cause hallucinations, delirium, a fast heartbeat and seizures, and may need a hospital stay.',
    source: 'MedlinePlus — Jimsonweed poisoning',
    sourceUrl: 'https://medlineplus.gov/ency/article/002881.htm',
  },
  {
    taxon: 'zigadenus',
    commonName: 'death camas',
    severity: 'deadly',
    note: 'All parts of death camas are poisonous and eating it can cause severe illness and occasionally death, even in adults. Its bulbs can be confused with wild onion or camas bulbs.',
    source: 'US Forest Service — Mountain deathcamas',
    sourceUrl: 'https://www.fs.usda.gov/wildflowers/plant-of-the-week/zigadenus_elegans.shtml',
  },
  {
    taxon: 'toxicoscordion venenosum',
    commonName: 'meadow death camas',
    severity: 'deadly',
    note: 'Death camas bulbs have been mistaken for wild onion while foraging; a family who ate them all needed intensive care for vomiting, a slow heartbeat and low blood pressure.',
    source:
      'American Journal of Emergency Medicine — Death camas poisoning after foraging for wild onions (2024)',
    sourceUrl: pubmed('39472268'),
  },
  {
    taxon: 'abrus precatorius',
    commonName: 'rosary pea',
    severity: 'deadly',
    note: 'The whole rosary pea plant is toxic and the seeds are highly toxic: chewing or crushing releases abrin, and even one seed must be treated as potentially dangerous. There is no antidote.',
    source: 'Poison Control (US National Capital Poison Center) — Are rosary peas poisonous?',
    sourceUrl: 'https://www.poison.org/articles/are-rosary-peas-poisonous-194',
  },
  {
    taxon: 'cerbera odollam',
    commonName: 'suicide tree / pong-pong',
    severity: 'deadly',
    note: 'The seeds contain cardiac glycosides (cerberin) that disrupt the heartbeat; they cause many poisoning deaths in South Asia, including 537 recorded in Kerala in 1989–1999.',
    source:
      'Clinical Practice and Cases in Emergency Medicine via PMC — Fatality after ingestion of Cerbera odollam seeds',
    sourceUrl: pmc('PMC6075506'),
  },
  {
    taxon: 'gloriosa superba',
    commonName: 'flame lily / glory lily',
    severity: 'deadly',
    note: 'All parts of the flame lily, especially the tubers, are extremely poisonous (colchicine). In western Sri Lanka it caused 44% of plant poisonings, with a 15% case fatality rate.',
    source: 'BMC Pharmacology & Toxicology via PMC — Gloriosa superba poisoning case report',
    sourceUrl: pmc('PMC4587877'),
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
  {
    taxon: 'amanita phalloides',
    commonName: 'death cap',
    severity: 'deadly',
    note: 'Death caps contain amatoxins, which cause over 90% of mushroom poisoning deaths worldwide and are not destroyed by cooking. Symptoms often start more than 6 hours after eating, before liver damage shows.',
    ...CDC_AMANITA_2026,
  },
  {
    taxon: 'amanita ocreata',
    commonName: 'western destroying angel',
    severity: 'deadly',
    note: 'Amanita ocreata, native to California, is similarly toxic to the death cap. Edible and toxic Amanita species can be hard to tell apart by appearance alone.',
    ...CDC_AMANITA_2026,
  },
  ...(
    [
      ['amanita virosa', 'European destroying angel'],
      ['amanita bisporigera', 'eastern destroying angel'],
    ] as const
  ).map(([taxon, commonName]): HighRiskEntry => ({
    taxon,
    commonName,
    severity: 'deadly',
    note: 'Destroying angels contain amatoxins. Symptoms start with a gut phase 8–24 hours after eating, then an apparent recovery before liver damage; without modern hospital care close to half of those poisoned die.',
    ...BAMS_AMATOXIN,
  })),
  {
    taxon: 'galerina marginata',
    commonName: 'deadly galerina',
    severity: 'deadly',
    note: 'The deadly galerina contains the same liver-destroying toxins as the death cap. It grows on dead wood in the same season as honey mushrooms and wild enoki and gets picked with them by mistake; it has a rust-brown spore print.',
    source: 'Mycological Association of Washington — Deadly mushrooms: Galerina marginata',
    sourceUrl: 'https://www.mawdc.org/page-18083',
  },
  ...(['lepiota brunneoincarnata', 'lepiota subincarnata'] as const).map(
    (taxon): HighRiskEntry => ({
      taxon,
      commonName: 'deadly dapperling',
      severity: 'deadly',
      note: 'This small Lepiota contains amatoxins, the same deadly toxins as the death cap. Foragers are advised never to eat small Lepiotas.',
      ...BAMS_AMATOXIN,
    }),
  ),
  {
    taxon: 'cortinarius orellanus',
    commonName: 'fool’s webcap',
    severity: 'deadly',
    note: 'The fool’s webcap contains orellanine, which damages the kidneys. Symptoms are typically delayed 1–2 weeks after eating, and there is no specific antidote.',
    source: 'Human & Experimental Toxicology — Toxicology of orellanine (2016)',
    sourceUrl: pubmed('26553321'),
  },
  {
    taxon: 'cortinarius rubellus',
    commonName: 'deadly webcap',
    severity: 'deadly',
    note: 'The deadly webcap causes acute kidney failure; symptoms can be delayed 2–30 days after eating, and about half of reported patients develop chronic kidney failure.',
    source: 'Clinical Kidney Journal via PMC — Acute renal failure from Cortinarius rubellus',
    sourceUrl: pmc('PMC4400554'),
  },
  ...(['clitocybe rivulosa', 'clitocybe dealbata'] as const).map((taxon): HighRiskEntry => ({
    taxon,
    commonName: 'fool’s funnel',
    severity: 'toxic',
    note: 'The fool’s funnel contains muscarine and is a poisonous look-alike of the fairy ring mushroom; both grow in grass and are similar in size.',
    source: 'MykoWeb (California Fungi) — Clitocybe rivulosa',
    sourceUrl: 'https://www.mykoweb.com/CAF/species/Clitocybe_rivulosa.html',
  })),
  {
    taxon: 'paxillus involutus',
    commonName: 'brown roll-rim / poison pax',
    severity: 'deadly',
    note: 'The brown roll-rim, once widely eaten, is now classed as dangerously poisonous. People who have eaten it repeatedly can develop a sudden immune reaction that destroys red blood cells; some cases have been fatal.',
    source: 'Diagnostics via PMC — Fatal immunohaemolysis after eating the poison pax',
    sourceUrl: pmc('PMC6963215'),
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
  // BfR: wild garlic is confused with lily of the valley and autumn crocus.
  'allium ursinum': ['colchicum autumnale', 'convallaria'],
  // AJEM 2024 (wild onion); US Forest Service (wild onion and camas bulbs).
  'allium canadense': ['toxicoscordion venenosum', 'zigadenus'],
  camassia: ['zigadenus', 'toxicoscordion venenosum'],
  // Clinical Toxicology 2017: fatal poisoning from foxglove mistaken for comfrey.
  symphytum: ['digitalis'],
  // Mycological Association of Washington: deadly galerina is picked with these.
  armillaria: ['galerina marginata'],
  flammulina: ['galerina marginata'],
  // MykoWeb: fool's funnel is a toxic look-alike of the fairy ring mushroom.
  'marasmius oreades': ['clitocybe rivulosa'],
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
