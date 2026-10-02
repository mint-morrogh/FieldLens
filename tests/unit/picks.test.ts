import { describe, expect, it, vi } from 'vitest';
import {
  CATEGORIES,
  CATEGORY_PICKER_ORDER,
  GROUPS,
  PICKER_SECTIONS,
  getTarget,
  isIdentifyTarget,
  targetMembers,
  taxonInScope,
  type TaxonRank,
} from '../../shared/categories';
import type { IdentifyTarget } from '../../shared/types';
import {
  BioclipIdentificationProvider,
  categoryForTaxon,
} from '../../server/providers/bioclip/bioclipProvider';
import { searchPicks } from '../../src/features/crop/CategoryPicker';
import type { IdentificationInput } from '../../server/providers/types';

type Taxon = Partial<Record<TaxonRank, string>>;

/** Real label rows from BioCLIP 2's Tree of Life list (checked 2026-10-02). */
const TAXA: Record<string, Taxon> = {
  greenCrab: {
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Malacostraca',
    order: 'Decapoda',
    family: 'Carcinidae',
    genus: 'Carcinus',
  },
  hermitCrab: {
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Malacostraca',
    order: 'Decapoda',
    family: 'Paguridae',
    genus: 'Pagurus',
  },
  pillBug: {
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Malacostraca',
    order: 'Isopoda',
    family: 'Armadillidiidae',
    genus: 'Armadillidium',
  },
  barnacle: {
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Maxillopoda',
    order: 'Sessilia',
    family: 'Balanidae',
    genus: 'Balanus',
  },
  horseshoeCrab: {
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Merostomata',
    order: 'Xiphosurida',
    family: 'Limulidae',
    genus: 'Limulus',
  },
  octopus: {
    kingdom: 'Animalia',
    phylum: 'Mollusca',
    class: 'Cephalopoda',
    order: 'Octopoda',
    family: 'Octopodidae',
    genus: 'Octopus',
  },
  mussel: {
    kingdom: 'Animalia',
    phylum: 'Mollusca',
    class: 'Bivalvia',
    order: 'Mytilida',
    family: 'Mytilidae',
    genus: 'Mytilus',
  },
  gardenSnail: {
    kingdom: 'Animalia',
    phylum: 'Mollusca',
    class: 'Gastropoda',
    order: 'Stylommatophora',
    family: 'Helicidae',
    genus: 'Cornu',
  },
  coneSnail: {
    kingdom: 'Animalia',
    phylum: 'Mollusca',
    class: 'Gastropoda',
    order: 'Neogastropoda',
    family: 'Conidae',
    genus: 'Conus',
  },
  seaStar: {
    kingdom: 'Animalia',
    phylum: 'Echinodermata',
    class: 'Asteroidea',
    order: 'Forcipulatida',
    family: 'Asteriidae',
    genus: 'Pisaster',
  },
  moonJelly: {
    kingdom: 'Animalia',
    phylum: 'Cnidaria',
    class: 'Scyphozoa',
    order: 'Semaeostomeae',
    family: 'Ulmaridae',
    genus: 'Aurelia',
  },
  manOWar: {
    kingdom: 'Animalia',
    phylum: 'Cnidaria',
    class: 'Hydrozoa',
    order: 'Siphonophorae',
    family: 'Physaliidae',
    genus: 'Physalia',
  },
  sponge: {
    kingdom: 'Animalia',
    phylum: 'Porifera',
    class: 'Demospongiae',
    order: 'Suberitida',
    family: 'Halichondriidae',
    genus: 'Halichondria',
  },
  seaSquirt: {
    kingdom: 'Animalia',
    phylum: 'Chordata',
    class: 'Ascidiacea',
    order: 'Phlebobranchia',
    family: 'Cionidae',
    genus: 'Ciona',
  },
  earthworm: {
    kingdom: 'Animalia',
    phylum: 'Annelida',
    class: 'Clitellata',
    order: 'Crassiclitellata',
    family: 'Lumbricidae',
    genus: 'Lumbricus',
  },
  kelp: {
    kingdom: 'Chromista',
    phylum: 'Ochrophyta',
    class: 'Phaeophyceae',
    order: 'Laminariales',
    family: 'Laminariaceae',
    genus: 'Laminaria',
  },
  seaLettuce: {
    kingdom: 'Plantae',
    phylum: 'Chlorophyta',
    class: 'Ulvophyceae',
    order: 'Ulvales',
    family: 'Ulvaceae',
    genus: 'Ulva',
  },
  haircapMoss: {
    kingdom: 'Plantae',
    phylum: 'Bryophyta',
    class: 'Polytrichopsida',
    order: 'Polytrichales',
    family: 'Polytrichaceae',
    genus: 'Polytrichum',
  },
  maple: {
    kingdom: 'Plantae',
    phylum: 'Tracheophyta',
    class: 'Magnoliopsida',
    order: 'Sapindales',
    family: 'Sapindaceae',
    genus: 'Acer',
  },
  reindeerLichen: {
    kingdom: 'Fungi',
    phylum: 'Ascomycota',
    class: 'Lecanoromycetes',
    order: 'Lecanorales',
    family: 'Cladoniaceae',
    genus: 'Cladonia',
  },
  flyAgaric: {
    kingdom: 'Fungi',
    phylum: 'Basidiomycota',
    class: 'Agaricomycetes',
    order: 'Agaricales',
    family: 'Amanitaceae',
    genus: 'Amanita',
  },
  gecko: {
    kingdom: 'Animalia',
    phylum: 'Chordata',
    class: 'Squamata',
    order: '',
    family: 'Gekkonidae',
    genus: 'Hemidactylus',
  },
  skink: {
    kingdom: 'Animalia',
    phylum: 'Chordata',
    class: 'Squamata',
    order: '',
    family: 'Scincidae',
    genus: 'Plestiodon',
  },
  slowWorm: {
    kingdom: 'Animalia',
    phylum: 'Chordata',
    class: 'Squamata',
    order: '',
    family: 'Anguidae',
    genus: 'Anguis',
  },
  garterSnake: {
    kingdom: 'Animalia',
    phylum: 'Chordata',
    class: 'Squamata',
    order: '',
    family: 'Colubridae',
    genus: 'Thamnophis',
  },
  alligator: {
    kingdom: 'Animalia',
    phylum: 'Chordata',
    class: 'Crocodylia',
    order: '',
    family: 'Alligatoridae',
    genus: 'Alligator',
  },
  paintedTurtle: {
    kingdom: 'Animalia',
    phylum: 'Chordata',
    class: 'Testudines',
    order: '',
    family: 'Emydidae',
    genus: 'Chrysemys',
  },
  newt: {
    kingdom: 'Animalia',
    phylum: 'Chordata',
    class: 'Amphibia',
    order: 'Caudata',
    family: 'Salamandridae',
    genus: 'Notophthalmus',
  },
  woodFrog: {
    kingdom: 'Animalia',
    phylum: 'Chordata',
    class: 'Amphibia',
    order: 'Anura',
    family: 'Ranidae',
    genus: 'Lithobates',
  },
  trout: {
    kingdom: 'Animalia',
    phylum: 'Chordata',
    class: '',
    order: 'Salmoniformes',
    family: 'Salmonidae',
    genus: 'Salmo',
  },
  stingray: {
    kingdom: 'Animalia',
    phylum: 'Chordata',
    class: 'Elasmobranchii',
    order: 'Myliobatiformes',
    family: 'Dasyatidae',
    genus: 'Dasyatis',
  },
  ladybug: {
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Insecta',
    order: 'Coleoptera',
    family: 'Coccinellidae',
    genus: 'Coccinella',
  },
  monarch: {
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Insecta',
    order: 'Lepidoptera',
    family: 'Nymphalidae',
    genus: 'Danaus',
  },
  mantis: {
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Insecta',
    order: 'Mantodea',
    family: 'Mantidae',
    genus: 'Mantis',
  },
  millipede: {
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Diplopoda',
    order: 'Julida',
    family: 'Julidae',
    genus: 'Julus',
  },
  tick: {
    kingdom: 'Animalia',
    phylum: 'Arthropoda',
    class: 'Arachnida',
    order: 'Ixodida',
    family: 'Ixodidae',
    genus: 'Ixodes',
  },
  robin: {
    kingdom: 'Animalia',
    phylum: 'Chordata',
    class: 'Aves',
    order: 'Passeriformes',
    family: 'Turdidae',
    genus: 'Turdus',
  },
  fox: {
    kingdom: 'Animalia',
    phylum: 'Chordata',
    class: 'Mammalia',
    order: 'Carnivora',
    family: 'Canidae',
    genus: 'Vulpes',
  },
};

const category = (t: Taxon) => categoryForTaxon(t.kingdom, t.class, t.phylum);
const inPick = (pick: IdentifyTarget, t: Taxon) => {
  const scope = getTarget(pick).taxonScope;
  return !!scope && taxonInScope(t, scope);
};

describe('new groups', () => {
  it('map each taxon to its true group', () => {
    expect(category(TAXA.greenCrab)).toBe('crustacean');
    expect(category(TAXA.pillBug)).toBe('crustacean');
    expect(category(TAXA.barnacle)).toBe('crustacean');
    expect(category(TAXA.horseshoeCrab)).toBe('crustacean');
    expect(category(TAXA.octopus)).toBe('mollusc');
    expect(category(TAXA.gardenSnail)).toBe('mollusc');
    expect(category(TAXA.seaStar)).toBe('echinoderm');
    expect(category(TAXA.manOWar)).toBe('cnidarian');
    expect(category(TAXA.sponge)).toBe('sponge');
    // Sea squirts are chordates with a class, so they must not fall into fish.
    expect(category(TAXA.seaSquirt)).toBe('sponge');
    expect(category(TAXA.earthworm)).toBe('worm');
    // Brown seaweed is Chromista, green and red are Plantae: neither may go to Pl@ntNet.
    expect(category(TAXA.kelp)).toBe('seaweed');
    expect(category(TAXA.seaLettuce)).toBe('seaweed');
    expect(category(TAXA.haircapMoss)).toBe('moss');
    expect(category(TAXA.maple)).toBe('plant');
    expect(category(TAXA.reindeerLichen)).toBe('fungus');
    expect(category(TAXA.trout)).toBe('fish');
  });

  it('every pick covers what its name promises, plus the look-alikes people expect', () => {
    const cases: [IdentifyTarget, (keyof typeof TAXA)[], (keyof typeof TAXA)[]][] = [
      [
        'crustacean',
        ['greenCrab', 'hermitCrab', 'barnacle', 'horseshoeCrab', 'pillBug'],
        ['octopus'],
      ],
      ['crawly', ['millipede', 'pillBug'], ['greenCrab', 'ladybug']],
      [
        'bug',
        ['ladybug', 'tick', 'pillBug', 'earthworm', 'gardenSnail', 'millipede'],
        ['greenCrab', 'coneSnail', 'octopus'],
      ],
      ['snail', ['gardenSnail', 'coneSnail'], ['mussel', 'octopus']],
      ['clam', ['mussel'], ['gardenSnail']],
      ['octopus', ['octopus'], ['trout', 'mussel']],
      ['fish', ['trout', 'stingray'], ['octopus', 'seaSquirt', 'seaStar']],
      ['echinoderm', ['seaStar'], ['moonJelly']],
      ['cnidarian', ['moonJelly', 'manOWar'], ['seaStar']],
      ['sponge', ['sponge', 'seaSquirt'], ['trout']],
      ['seaweed', ['kelp', 'seaLettuce'], ['maple', 'haircapMoss']],
      ['moss', ['haircapMoss'], ['maple', 'seaLettuce']],
      ['lichen', ['reindeerLichen'], ['flyAgaric']],
      [
        'shore',
        ['greenCrab', 'octopus', 'seaStar', 'moonJelly', 'kelp', 'trout', 'seaSquirt'],
        ['ladybug', 'fox', 'maple'],
      ],
      ['snake', ['garterSnake', 'slowWorm'], ['gecko', 'newt']],
      ['lizard', ['gecko', 'skink', 'alligator', 'newt'], ['garterSnake', 'paintedTurtle']],
      ['salamander', ['newt', 'skink'], ['woodFrog']],
      ['frog', ['woodFrog'], ['newt']],
      ['turtle', ['paintedTurtle'], ['alligator']],
      ['beetle', ['ladybug'], ['monarch']],
      ['butterfly', ['monarch'], ['ladybug']],
      ['grasshopper', ['mantis'], ['ladybug']],
      ['animal', ['robin', 'fox', 'woodFrog', 'trout', 'alligator'], ['greenCrab', 'ladybug']],
    ];
    for (const [pick, yes, no] of cases) {
      for (const t of yes) expect(inPick(pick, TAXA[t]), `${t} in ${pick}`).toBe(true);
      for (const t of no) expect(inPick(pick, TAXA[t]), `${t} not in ${pick}`).toBe(false);
    }
  });

  it('anything a pick can return belongs to one of its member categories', () => {
    for (const pick of CATEGORY_PICKER_ORDER) {
      const members = targetMembers(pick);
      for (const [name, t] of Object.entries(TAXA)) {
        if (inPick(pick, t)) expect(members, `${name} via ${pick}`).toContain(category(t));
      }
    }
  });

  it('every pick in the sheet is a real, scoped target', () => {
    expect(new Set(CATEGORY_PICKER_ORDER).size).toBe(CATEGORY_PICKER_ORDER.length);
    for (const section of PICKER_SECTIONS) {
      for (const item of [...(section.all ? [section.all] : []), ...section.items]) {
        expect(isIdentifyTarget(item.id)).toBe(true);
        const def = getTarget(item.id);
        // Plants (Pl@ntNet) are the only picks without a BioCLIP scope.
        if (!['plant', 'tree'].includes(item.id)) expect(def.taxonScope, item.id).toBeDefined();
        if (def.widenTo) expect(isIdentifyTarget(def.widenTo)).toBe(true);
      }
    }
    // Every new category is reachable from the sheet or "Not sure".
    for (const c of Object.keys(CATEGORIES)) {
      if (c === 'other') continue;
      expect(GROUPS.auto.members, c).toContain(c);
    }
  });

  it('search finds picks by everyday words, including crossovers', () => {
    const ids = (q: string) => searchPicks(q).map((r) => r.item.id);
    expect(ids('crab')[0]).toBe('crustacean');
    expect(ids('roly-poly')).toEqual(expect.arrayContaining(['crawly', 'crustacean']));
    expect(ids('starfish')).toEqual(['echinoderm']);
    expect(ids('kelp')).toEqual(['seaweed']);
    expect(ids('newt')).toContain('salamander');
    expect(ids('LADYBUG')).toEqual(['beetle']);
    expect(ids('zzz')).toEqual([]);
  });
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const input = (category: IdentifyTarget): IdentificationInput => ({
  observationId: 'o',
  category,
  images: [{ data: JPEG, mimeType: 'image/jpeg', feature: 'auto' }],
  capturedAt: new Date('2026-10-02T12:00:00Z'),
});
const sse = (payload: unknown) => `event: complete\ndata: ${JSON.stringify([payload])}\n\n`;

function fakeSpace(responses: unknown[]) {
  const payloads: Record<string, unknown>[] = [];
  let call = 0;
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      payloads.push(JSON.parse(String(init.body)).data[0]);
      return new Response(JSON.stringify({ event_id: `e${call}` }));
    }
    return new Response(sse(responses[call++]));
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, payloads };
}

const row = (name: string, t: Taxon, score: number) => ({ name, score, species: name, ...t });
const space = (results: unknown[], groupProbability: number | null = null) => ({
  results,
  rank: 'species',
  restricted: true,
  candidateCount: 1000,
  groupProbability,
});
const ALL = Object.keys(CATEGORIES).filter((c) => c !== 'other') as never[];

describe('wrong picks', () => {
  it('a narrow pick that doesn’t match widens to its broader group', async () => {
    const { fetchImpl, payloads } = fakeSpace([
      space([row('Coccinella septempunctata', TAXA.ladybug, 0.6)], 0.05),
      // Second opinion: the top species are butterflies, not beetles.
      space([row('Danaus plexippus', TAXA.monarch, 0.8), row('Vanessa cardui', TAXA.monarch, 0.1)]),
      space([row('Danaus plexippus', TAXA.monarch, 0.9)], 0.9),
    ]);
    const provider = new BioclipIdentificationProvider('https://s', 't', ALL, fetchImpl);
    const result = await provider.identify(input('beetle'));
    expect(payloads.map((p) => p.k)).toEqual([expect.any(Number), 20, expect.any(Number)]);
    expect(payloads[2].within).toEqual(GROUPS.bug.taxonScope);
    expect(result.categoryCheck).toBeUndefined();
    expect(result.candidates[0].scientificName).toBe('Danaus plexippus');
  });

  it('keeps the pick when the second opinion agrees, crossovers included', async () => {
    const { fetchImpl, payloads } = fakeSpace([
      space([row('Notophthalmus viridescens', TAXA.newt, 0.7)], 0.3),
      space([
        row('Notophthalmus viridescens', TAXA.newt, 0.5),
        row('Plestiodon fasciatus', TAXA.skink, 0.2),
        row('Amanita muscaria', TAXA.flyAgaric, 0.3),
      ]),
    ]);
    const provider = new BioclipIdentificationProvider('https://s', 't', ALL, fetchImpl);
    const result = await provider.identify(input('lizard'));
    expect(payloads).toHaveLength(2);
    // A newt picked as a lizard still reads as an amphibian.
    expect(result.candidates[0].category).toBe('amphibian');
  });

  it('a broad pick that doesn’t match suggests the right group', async () => {
    const { fetchImpl } = fakeSpace([
      space([row('Pagurus acadianus', TAXA.hermitCrab, 0.6)], 0.04),
      space([
        row('Carcinus maenas', TAXA.greenCrab, 0.7),
        row('Cancer irroratus', TAXA.greenCrab, 0.2),
      ]),
    ]);
    const provider = new BioclipIdentificationProvider('https://s', 't', ALL, fetchImpl);
    const result = await provider.identify(input('animal'));
    expect(result.candidates).toEqual([]);
    expect(result.categoryCheck?.suggestedCategory).toBe('crustacean');
  });

  it('“Not sure” detects a crab as a crustacean', async () => {
    const { fetchImpl } = fakeSpace([
      space([
        row('Carcinus maenas', TAXA.greenCrab, 0.6),
        row('Laminaria digitata', TAXA.kelp, 0.1),
      ]),
    ]);
    const provider = new BioclipIdentificationProvider('https://s', 't', ALL, fetchImpl);
    expect((await provider.detectCategory(input('auto'))).category).toBe('crustacean');
  });

  it('plankton look-alikes don’t outvote a jellyfish (real scores, 2026-10-02)', async () => {
    const plankton = (name: string, phylum: string, score: number) =>
      row(name, { kingdom: 'Chromista', phylum, class: '' }, score);
    const vote = space([
      plankton('Poricayiptra gaarderae', 'Haptophyta', 0.028),
      plankton('Togula britannica', 'Myzozoa', 0.0137),
      row('Aurelia aurita', TAXA.moonJelly, 0.0132),
      plankton('Gambierdiscus pacificus', 'Myzozoa', 0.0115),
      row('Cosmetira pilosella', TAXA.moonJelly, 0.0106),
      plankton('Helicosphaera hyalina', 'Haptophyta', 0.0101),
      row('Dendraster hesperis', TAXA.seaStar, 0.0097),
    ]);
    const { fetchImpl } = fakeSpace([
      space([row('Aurelia aurita', TAXA.moonJelly, 0.098)], 0.135),
      vote,
      vote,
    ]);
    const provider = new BioclipIdentificationProvider('https://s', 't', ALL, fetchImpl);
    const result = await provider.identify(input('cnidarian'));
    expect(result.candidates[0]?.scientificName).toBe('Aurelia aurita');
    expect((await provider.detectCategory(input('auto'))).category).toBe('cnidarian');
  });
});
