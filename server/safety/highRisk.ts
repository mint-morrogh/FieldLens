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
 * - Cite poison centres, health agencies, extension services, mycological
 *   societies, museums and peer-reviewed toxicology, not Wikipedia; always set
 *   `source`. All sources checked 2026-09-28.
 */

export type HighRiskEntry = {
  /** Lower-case genus, or "genus species". */
  taxon: string;
  commonName: string;
  note: string;
  severity: 'deadly' | 'toxic' | 'skin' | 'caution';
  /** Publisher and page. Optional only for the safety.ts fallback; every entry here sets it. */
  source?: string;
  sourceUrl: string;
};

const pubmed = (id: string) => `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
const pmc = (id: string) => `https://pmc.ncbi.nlm.nih.gov/articles/${id}/`;
const CDC_AMANITA_2026 = {
  source: 'CDC MMWR — Amanita species mushroom poisonings, Northern California, 2025–2026',
  sourceUrl: 'https://www.cdc.gov/mmwr/volumes/75/wr/mm7520a2.htm',
};
const ncsu = (slug: string) => `https://plants.ces.ncsu.edu/plants/${slug}/`;
const NAMA_SYNDROMES = {
  source: 'North American Mycological Association — Mushroom poisoning syndromes',
  sourceUrl: 'https://namyco.org/mushroom-poisoning-syndromes/',
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
    note: 'Water hemlocks are highly poisonous and may be fatal if eaten. All parts are poisonous, and the roots are the most poisonous part.',
    source: 'NC State Extension — Cicuta maculata',
    sourceUrl: ncsu('cicuta-maculata'),
  },
  {
    taxon: 'conium maculatum',
    commonName: 'poison hemlock',
    severity: 'deadly',
    note: 'All parts of poison hemlock are highly poisonous to people and animals and may be fatal if eaten.',
    source: 'NC State Extension — Conium maculatum',
    sourceUrl: ncsu('conium-maculatum'),
  },
  {
    taxon: 'actaea',
    commonName: 'baneberry',
    severity: 'toxic',
    note: 'All parts of baneberry are poisonous, mainly the bright berries and the roots.',
    source: 'NC State Extension — Actaea pachypoda',
    sourceUrl: ncsu('actaea-pachypoda'),
  },
  {
    taxon: 'taxus',
    commonName: 'yew',
    severity: 'deadly',
    note: 'Yews are poisonous and may be fatal if eaten; the leaves, bark, berries and seeds are all poisonous.',
    source: 'NC State Extension — Taxus',
    sourceUrl: ncsu('taxus'),
  },
  {
    taxon: 'solanum dulcamara',
    commonName: 'bittersweet nightshade',
    severity: 'toxic',
    note: 'All parts of bittersweet nightshade are poisonous to people, pets and livestock; its bright red berries are a risk to children.',
    source: 'NC State Extension — Solanum dulcamara',
    sourceUrl: ncsu('solanum-dulcamara'),
  },
  {
    taxon: 'atropa',
    commonName: 'deadly nightshade',
    severity: 'deadly',
    note: 'The leaves, roots and berries of deadly nightshade are highly toxic, and larger doses can kill.',
    source: 'NC State Extension — Atropa bella-donna',
    sourceUrl: ncsu('atropa-bella-donna'),
  },
  {
    taxon: 'phytolacca',
    commonName: 'pokeweed',
    severity: 'toxic',
    note: 'The whole pokeweed plant is poisonous. Eating the roots has caused serious poisonings, and eating several berries can cause stomach pain, vomiting and diarrhea.',
    source: 'Poison Control (US National Capital Poison Center) — Pokeberries: a grape look-alike',
    sourceUrl: 'https://www.poison.org/articles/pokeberries-and-grapes-look-alike',
  },
  {
    taxon: 'menispermum',
    commonName: 'moonseed',
    severity: 'toxic',
    note: 'Moonseed fruit is poisonous and is easily confused with wild grapes. Each moonseed fruit has a single crescent-shaped seed; grapes have round seeds.',
    source: 'NC State Extension — Menispermum canadense',
    sourceUrl: ncsu('menispermum-canadense'),
  },
  {
    taxon: 'aconitum',
    commonName: 'monkshood',
    severity: 'deadly',
    note: 'All parts of monkshood are poisonous and may be fatal to people and pets if eaten.',
    source: 'NC State Extension — Aconitum',
    sourceUrl: ncsu('aconitum'),
  },
  {
    taxon: 'digitalis',
    commonName: 'foxglove',
    severity: 'deadly',
    note: 'Foxglove contains cardiac glycosides and is highly poisonous if eaten; poisoning can cause an irregular heartbeat and death.',
    source: 'NC State Extension — Digitalis purpurea',
    sourceUrl: ncsu('digitalis-purpurea'),
  },
  {
    // MedlinePlus: "Death is unlikely"; NC State rates poison severity "Low". Was 'deadly'.
    taxon: 'convallaria',
    commonName: 'lily of the valley',
    severity: 'toxic',
    note: 'The flowers, berries and leaves of lily of the valley are poisonous. Poisoning can affect the heartbeat and may need a hospital stay.',
    source: 'MedlinePlus — Lily of the valley poisoning',
    sourceUrl: 'https://medlineplus.gov/ency/article/002882.htm',
  },
  {
    taxon: 'veratrum',
    commonName: 'false hellebore',
    severity: 'deadly',
    note: 'False hellebores contain steroidal alkaloids; the flowers, fruits, leaves, roots and stems are highly poisonous.',
    source: 'NC State Extension — Veratrum viride',
    sourceUrl: ncsu('veratrum-viride'),
  },
  {
    taxon: 'kalmia',
    commonName: 'laurel (Kalmia)',
    severity: 'toxic',
    note: 'Kalmia laurels contain grayanotoxins and are poisonous to people, pets and livestock.',
    source: 'NC State Extension — Kalmia latifolia',
    sourceUrl: ncsu('kalmia-latifolia'),
  },
  {
    taxon: 'arisaema',
    commonName: 'jack-in-the-pulpit',
    severity: 'toxic',
    note: 'Jack-in-the-pulpit contains calcium oxalate crystals; eating it causes severe mouth pain and swelling of the lips, tongue and throat.',
    source: 'NC State Extension — Arisaema triphyllum',
    sourceUrl: ncsu('arisaema-triphyllum'),
  },
  {
    taxon: 'toxicodendron',
    commonName: 'poison ivy / poison sumac',
    severity: 'skin',
    note: 'The oil in these plants (urushiol) causes an itchy, blistering rash in most people, even in tiny amounts. After contact, wash the skin right away with soap and plenty of water.',
    source: 'CDC NIOSH — Poisonous plants',
    sourceUrl: 'https://www.cdc.gov/niosh/outdoor-workers/about/poisonous-plants.html',
  },
  {
    taxon: 'heracleum mantegazzianum',
    commonName: 'giant hogweed',
    severity: 'skin',
    note: 'Giant hogweed sap and sunlight together can cause serious burns and blisters. After contact, wash with soap and water as soon as possible and keep the skin out of the sun for 48 hours.',
    source: 'New York State DEC — Giant hogweed',
    sourceUrl: 'https://dec.ny.gov/nature/animals-fish-plants/plants/harmful-plants/giant-hogweed',
  },
  {
    taxon: 'pastinaca sativa',
    commonName: 'wild parsnip',
    severity: 'skin',
    note: 'Wild parsnip sap on skin exposed to sunlight can cause burns and blisters. After contact, wash the skin right away.',
    source: 'University of Illinois Extension — Invasive wild parsnip',
    sourceUrl: 'https://extension.illinois.edu/invasives/invasive-wild-parsnip',
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
    note: 'The genus includes the death caps and destroying angels, which cause the vast majority of fatal mushroom poisonings worldwide.',
    ...BAMS_AMATOXIN,
  },
  {
    taxon: 'galerina',
    commonName: 'galerinas',
    severity: 'deadly',
    note: 'Some Galerina species, such as the deadly galerina, contain amatoxins at levels rivalling the death cap. Cooking does not destroy them.',
    source: 'Beaty Biodiversity Museum (UBC) — Galerina marginata',
    sourceUrl: 'https://explore.beatymuseum.ubc.ca/mushroomsup/G_marginata.html',
  },
  {
    taxon: 'lepiota',
    commonName: 'lepiotas',
    severity: 'deadly',
    note: 'Small Lepiota species, often with pinkish tones, have caused deadly poisonings.',
    ...BAMS_AMATOXIN,
  },
  {
    taxon: 'gyromitra',
    commonName: 'false morels',
    severity: 'deadly',
    note: 'False morels contain gyromitrin and have caused severe illness and, in a few cases, death through damage to red blood cells and the liver.',
    source: 'Beaty Biodiversity Museum (UBC) — Gyromitra esculenta',
    sourceUrl: 'https://explore.beatymuseum.ubc.ca/mushroomsup/G_esculenta.html',
  },
  {
    taxon: 'cortinarius',
    commonName: 'webcaps',
    severity: 'deadly',
    note: 'Some webcaps contain orellanine, which causes kidney failure. Symptoms appear 36 hours to 3 weeks after eating.',
    ...NAMA_SYNDROMES,
  },
  {
    taxon: 'inocybe',
    commonName: 'fibrecaps',
    severity: 'toxic',
    note: 'Inocybe species contain muscarine and are poisonous. Symptoms usually start within 15–30 minutes.',
    ...NAMA_SYNDROMES,
  },
  {
    taxon: 'clitocybe',
    commonName: 'funnel caps',
    severity: 'toxic',
    note: 'Some Clitocybe species, such as C. rivulosa, contain muscarine and are poisonous.',
    ...NAMA_SYNDROMES,
  },
  {
    taxon: 'omphalotus',
    commonName: "jack-o'-lantern mushroom",
    severity: 'toxic',
    note: "Jack-o'-lanterns are poisonous and have been mistaken for chanterelles. They grow on wood (which may be buried) and have true, deep gills and orange flesh.",
    source: 'Bay Area Mycological Society — Other toxic mushrooms',
    sourceUrl: 'https://bayareamushrooms.org/poisonings/non_fatal.html',
  },
  {
    taxon: 'chlorophyllum molybdites',
    commonName: 'green-spored parasol',
    severity: 'toxic',
    note: 'The green-spored parasol is the most common mushroom cause of poisoning in North America, with severe vomiting and diarrhea.',
    ...NAMA_SYNDROMES,
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
  note: 'The false chanterelle is easily confused with true chanterelles, which are much fleshier and have blunt ridges rather than true gills. Some authors list it as poisonous.',
  source: 'MykoWeb (California Fungi) — Hygrophoropsis aurantiaca',
  sourceUrl: 'https://www.mykoweb.com/CAF/species/Hygrophoropsis_aurantiaca.html',
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
