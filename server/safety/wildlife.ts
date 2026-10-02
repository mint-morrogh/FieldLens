/**
 * Hand-curated wildlife safety notes, worldwide: mainly mammals, plus some
 * dangerous reptiles and amphibians, and beach and sea life (marine.ts, checked
 * 2026-10-02). They show for every animal category.
 *
 * Rules for editing this file:
 * - Each note must be supported by the linked page (checked 2026-09-27/28).
 * - Warnings only: never say an animal is harmless or safe to approach or handle.
 * - Match at the broadest rank the note is true for (order, family, genus or species).
 */
import type {
  ConfidenceBand,
  OrganismCandidate,
  SafetyInfo,
  SafetyStatement,
} from '../../shared/types.js';
import { MARINE_NOTES } from './marine.js';

type Rank = 'order' | 'family' | 'genus' | 'species';

export type WildlifeNote = {
  rank: Rank;
  /** Lower-case taxon name at `rank`. */
  taxon: string;
  commonName: string;
  note: string;
  /** Only relevant to droppings (e.g. raccoon roundworm, hantavirus). */
  sign?: 'scat';
  source: string;
  sourceUrl: string;
};

const CDC_RABIES = {
  source: 'CDC — About Rabies',
  sourceUrl: 'https://www.cdc.gov/rabies/about/index.html',
};
const NPS_YELLOWSTONE = {
  source: 'US National Park Service — Yellowstone safety',
  sourceUrl: 'https://www.nps.gov/yell/planyourvisit/safety.htm',
};
const NSW_RABIES = {
  source: 'NSW Health — Rabies and Australian bat lyssavirus',
  sourceUrl:
    'https://www.health.nsw.gov.au/Infectious/factsheets/Pages/rabies-australian-bat-lyssavirus-infection.aspx',
};
const WHO_SNAKES = {
  source: 'WHO — Snakebite envenoming: snakes gallery',
  sourceUrl:
    'https://www.who.int/teams/control-of-neglected-tropical-diseases/snakebite-envenoming/snakes-gallery',
};
const WHO_SEARO_SNAKEBITE = {
  source: 'WHO South-East Asia — Guidelines for the management of snakebites (2nd ed., 2016)',
  sourceUrl:
    'https://cdn.who.int/media/docs/default-source/searo/india/health-topic-pdf/who-guidance-on-management-of-snakebites.pdf',
};

export const WILDLIFE_NOTES: WildlifeNote[] = [
  {
    rank: 'order',
    taxon: 'chiroptera',
    commonName: 'bats',
    note: 'Bats are among the animals most often found with rabies, and bat contact is the leading cause of human rabies deaths in the US. Never handle a bat; if you may have been bitten or scratched, seek medical attention urgently.',
    ...CDC_RABIES,
  },
  {
    rank: 'genus',
    taxon: 'procyon',
    commonName: 'raccoons',
    note: 'Raccoons are among the animals most often found with rabies. Don’t approach or feed them; if you may have been bitten or scratched, seek medical attention urgently.',
    ...CDC_RABIES,
  },
  {
    rank: 'genus',
    taxon: 'procyon',
    commonName: 'raccoons',
    sign: 'scat',
    note: 'Raccoon droppings can carry roundworm eggs that infect people who swallow them by mistake. Don’t touch raccoon droppings or latrines with bare hands, and wash your hands after being outdoors.',
    source: 'CDC — About Baylisascaris',
    sourceUrl: 'https://www.cdc.gov/baylisascaris/about/index.html',
  },
  {
    rank: 'family',
    taxon: 'mephitidae',
    commonName: 'skunks',
    note: 'Skunks are among the animals most often found with rabies. Keep your distance; if you may have been bitten or scratched, seek medical attention urgently.',
    ...CDC_RABIES,
  },
  {
    rank: 'family',
    taxon: 'mephitidae',
    commonName: 'skunks',
    note: 'Skunks can spray their oily musk up to about 20 feet (6 m) with good aim. In the eyes it causes short-term stinging, burning, redness and tearing; rinse the eyes gently with room-temperature water for 15 minutes.',
    source: 'Poison Control (National Capital Poison Center) — What happens if a skunk sprays me?',
    sourceUrl: 'https://www.poison.org/articles/what-happens-if-a-skunk-sprays-me-213',
  },
  {
    rank: 'genus',
    taxon: 'vulpes',
    commonName: 'foxes',
    note: 'Foxes are among the animals most often found with rabies. Don’t approach or feed them; if you may have been bitten or scratched, seek medical attention urgently.',
    ...CDC_RABIES,
  },
  {
    rank: 'genus',
    taxon: 'urocyon',
    commonName: 'grey foxes',
    note: 'Foxes are among the animals most often found with rabies. Don’t approach or feed them; if you may have been bitten or scratched, seek medical attention urgently.',
    ...CDC_RABIES,
  },
  {
    rank: 'family',
    taxon: 'ursidae',
    commonName: 'bears',
    note: 'Keep your distance from bears, always leave them an escape route, and never get between a mother and her cubs. Never let a bear get your food. Bear spray is used to stop an aggressive or charging bear.',
    source: 'US National Park Service — Bear safety',
    sourceUrl: 'https://www.nps.gov/subjects/bears/safety.htm',
  },
  {
    rank: 'genus',
    taxon: 'alces',
    commonName: 'moose',
    note: 'In Alaska more people are injured by moose than by bears each year. Cows with young calves attack people who come too close, bulls may be aggressive in the autumn rut, and moose treat dogs as enemies. Raised hair on the hump and laid-back ears are warning signs; if a moose charges, get behind something solid such as a tree or a car.',
    source: 'Alaska Department of Fish and Game — Aggressive moose',
    sourceUrl: 'https://www.adfg.alaska.gov/index.cfm?adfg=livewith.aggressivemoose',
  },
  {
    rank: 'genus',
    taxon: 'bison',
    commonName: 'bison',
    note: 'Bison have injured more people in Yellowstone than any other animal and run three times faster than people. The park asks visitors to stay at least 25 yards (23 m) away and never approach one for a photo.',
    ...NPS_YELLOWSTONE,
  },
  {
    rank: 'species',
    taxon: 'cervus canadensis',
    commonName: 'elk',
    note: 'Yellowstone asks visitors to stay at least 25 yards (23 m) from elk at all times and never approach one for a photo.',
    ...NPS_YELLOWSTONE,
  },
  {
    rank: 'species',
    taxon: 'canis lupus',
    commonName: 'wolves',
    note: 'Yellowstone asks visitors to stay at least 100 yards (91 m) from wolves at all times and never approach one for a photo.',
    ...NPS_YELLOWSTONE,
  },
  {
    rank: 'species',
    taxon: 'puma concolor',
    commonName: 'cougars',
    note: 'Yellowstone asks visitors to stay at least 100 yards (91 m) from cougars at all times and never approach one for a photo.',
    ...NPS_YELLOWSTONE,
  },
  {
    rank: 'species',
    taxon: 'canis latrans',
    commonName: 'coyotes',
    note: 'Never feed coyotes; it gets them used to people. Never run away from a coyote. Keep small dogs on a leash and don’t leave them outside unattended.',
    source: 'Humane World for Animals — What to do about coyotes',
    sourceUrl: 'https://www.humaneworld.org/resources/what-do-about-coyotes',
  },
  {
    rank: 'genus',
    taxon: 'erethizon',
    commonName: 'porcupines',
    note: 'Pets that haven’t learned to leave porcupines alone can be seriously and very painfully injured by the quills. Quills left in pets or livestock may cause fatal injury if not removed promptly.',
    source: 'Montana Fish, Wildlife & Parks — Living with porcupines',
    sourceUrl: 'https://fwp.mt.gov/conservation/living-with-wildlife/porcupines',
  },
  {
    rank: 'family',
    taxon: 'cervidae',
    commonName: 'deer',
    note: 'Deer are a source of blood for blacklegged ticks, which can spread Lyme disease. Deer don’t carry the bacteria themselves, but check for ticks after walking where deer live — prompt tick removal can prevent infection.',
    source: 'CDC — Lyme disease: causes',
    sourceUrl: 'https://www.cdc.gov/lyme/causes/index.html',
  },
  ...(['muridae', 'cricetidae'] as const).map((family): WildlifeNote => ({
    rank: 'family',
    taxon: family,
    commonName: 'mice & rats',
    sign: 'scat',
    note: 'Don’t sweep or vacuum rodent droppings — it can put viruses such as hantavirus into the air. Spray them with bleach solution or disinfectant until very wet and let it soak for 5 minutes first.',
    source: 'CDC — Cleaning up after rodents',
    sourceUrl: 'https://www.cdc.gov/healthy-pets/rodent-control/clean-up.html',
  })),

  // ---- Beyond North America ----
  {
    rank: 'order',
    taxon: 'chiroptera',
    commonName: 'bats',
    note: 'In Australia any bat could carry Australian bat lyssavirus, a rabies-like virus; only vaccinated, trained people should handle bats. If a bat anywhere bites or scratches you, wash the wound with soap and water for at least 15 minutes and seek medical advice.',
    ...NSW_RABIES,
  },
  {
    rank: 'order',
    taxon: 'chiroptera',
    commonName: 'bats',
    note: 'In the UK a small number of bats carry lyssaviruses, viruses that cause rabies. There’s no risk if you don’t handle bats; if you must move a grounded or injured bat, wear thick gloves.',
    source: 'Bat Conservation Trust — Bats and rabies in the UK',
    sourceUrl:
      'https://www.bats.org.uk/about-bats/bats-and-disease/bats-and-disease-in-the-uk/bats-and-rabies',
  },
  ...(
    [
      ['cercopithecidae', 'monkeys'],
      ['herpestidae', 'mongooses'],
    ] as const
  ).map(([taxon, commonName]): WildlifeNote => ({
    rank: 'family',
    taxon,
    commonName,
    note: `Outside Australia, ${commonName} are among the animals that can transmit rabies. If one bites or scratches you, wash the wound with soap and water for at least 15 minutes and seek medical advice.`,
    ...NSW_RABIES,
  })),
  ...(['canis aureus', 'lupulella mesomelas', 'lupulella adusta'] as const).map(
    (taxon): WildlifeNote => ({
      rank: 'species',
      taxon,
      commonName: 'jackals',
      note: 'Jackals are among the animals that can transmit rabies. If one bites or scratches you, wash the wound with soap and water for at least 15 minutes and seek medical advice.',
      ...NSW_RABIES,
    }),
  ),
  {
    rank: 'genus',
    taxon: 'macaca',
    commonName: 'macaques',
    note: 'Macaques can carry B virus, which spreads to people through bites or scratches. If you’re bitten or scratched, wash the area thoroughly with soap for 15 minutes and seek medical attention promptly, mentioning the monkey.',
    source: 'CDC — About B virus',
    sourceUrl: 'https://www.cdc.gov/herpes-b-virus/about/index.html',
  },
  {
    rank: 'species',
    taxon: 'sus scrofa',
    commonName: 'wild boar',
    note: 'Wild boar defend their young and have attacked and killed dogs. When you see boar, put your dog on a lead, give them space and take another path or stand still until they move off. Don’t feed them.',
    source: 'Forestry England — Wild boar in the Forest of Dean',
    sourceUrl: 'https://www.forestryengland.uk/article/wild-boar-the-forest-dean',
  },
  ...(
    [
      ['cervus elaphus', 'red deer'],
      ['dama dama', 'fallow deer'],
    ] as const
  ).map(([taxon, commonName]): WildlifeNote => ({
    rank: 'species',
    taxon,
    commonName,
    note: 'London’s Royal Parks ask visitors to keep at least 50 m from deer and never touch or feed them, especially in the autumn rut and the May–July birthing season, when deer can feel threatened by dogs. If a deer advances on you, back off slowly without waving or shouting.',
    source: 'The Royal Parks — Deer safety advice',
    sourceUrl: 'https://www.royalparks.org.uk/deer-safety-advice',
  })),
  {
    rank: 'species',
    taxon: 'canis dingo',
    commonName: 'dingoes',
    note: 'Never feed dingoes — fed dingoes can become aggressive. Keep children within arm’s reach, stay at least 20 m away, walk rather than run, and carry a stick outside fenced areas.',
    source: 'Queensland Parks — Be dingo-safe on K’gari',
    sourceUrl: 'https://parks.qld.gov.au/parks/kgari-fraser/about/wongari-dingoes/dingo-safe',
  },
  {
    rank: 'species',
    taxon: 'ornithorhynchus anatinus',
    commonName: 'platypus',
    note: 'Male platypuses have a venomous spur on each ankle. The venom isn’t lethal to people but can cause excruciating pain and swelling. Don’t handle them.',
    source: 'Australian Museum — Platypus',
    sourceUrl: 'https://australian.museum/learn/animals/mammals/platypus/',
  },
  {
    rank: 'family',
    taxon: 'macropodidae',
    commonName: 'kangaroos & wallabies',
    note: 'Don’t approach or feed kangaroos — fed animals can quickly become aggressive. Admire them from afar and keep dogs on a lead so they don’t feel threatened.',
    source: 'ACT Government — Living with kangaroos',
    sourceUrl:
      'https://www.act.gov.au/environment/animals-and-plants/animals/wildlife-management/eastern-grey-kangaroo/living-with-kangaroos',
  },
  ...(
    [
      ['species', 'hippopotamus amphibius', 'hippos'],
      ['genus', 'loxodonta', 'African elephants'],
      ['species', 'syncerus caffer', 'African buffalo'],
      ['species', 'panthera leo', 'lions'],
      ['species', 'panthera pardus', 'leopards'],
      ['family', 'rhinocerotidae', 'rhinos'],
    ] as const
  ).map(([rank, taxon, commonName]): WildlifeNote => ({
    rank,
    taxon,
    commonName,
    note: 'Because of dangerous animals, South African national parks only allow you out of your vehicle in designated areas. Keep doors closed and don’t lean out of windows or sunroofs.',
    source: 'SANParks — Rules & regulations',
    sourceUrl: 'https://www.sanparks.org/travel/plan/useful-information/rules-regulations',
  })),
  {
    rank: 'species',
    taxon: 'hippopotamus amphibius',
    commonName: 'hippos',
    note: 'Hippos can be aggressive when they sense danger, such as when someone encroaches on their habitat, and are one of Africa’s most dangerous animals. Their bite can be lethal, and they may kill 500 to 3,000 people a year.',
    source: 'National Geographic — Hippopotamus',
    sourceUrl: 'https://www.nationalgeographic.com/animals/mammals/facts/hippopotamus',
  },
  {
    rank: 'species',
    taxon: 'syncerus caffer',
    commonName: 'African buffalo',
    note: 'Outside national parks, African buffalo are considered dangerous because of their size, aggressive nature and formidable horns.',
    source: 'African Wildlife Foundation — African buffalo',
    sourceUrl: 'https://www.awf.org/wildlife-conservation/african-buffalo',
  },
  {
    rank: 'genus',
    taxon: 'loxodonta',
    commonName: 'African elephants',
    note: 'Elephants are usually peaceful, but cows may be aggressive when young calves are present, bulls can be exceptionally aggressive during musth, and any elephant may become aggressive when sick, injured or harassed.',
    source: 'SANParks — Elephant behaviour (Letaba Elephant Hall, Kruger)',
    sourceUrl:
      'https://www.sanparks.org/conservation/parks/kruger/letaba-elephant-hall/about-elephants/behaviour',
  },
  {
    rank: 'species',
    taxon: 'elephas maximus',
    commonName: 'Asian elephants',
    note: 'From about age 30, most healthy bull Asian elephants have regular periods of musth, a massive rush of testosterone that makes them aggressive.',
    source: 'Smithsonian’s National Zoo — Asian elephant',
    sourceUrl: 'https://nationalzoo.si.edu/animals/asian-elephant',
  },
  {
    rank: 'species',
    taxon: 'panthera tigris',
    commonName: 'tigers',
    note: 'Never turn your back on a tiger or run away. Tigers are known to attack people from behind. If one stalks you, make yourself as tall and wide as possible and shout; avoid bending or squatting, which may trigger an attack, and back away slowly while facing it.',
    source: 'Wild Tiger Health Centre — How to respond if you encounter a tiger',
    sourceUrl:
      'https://wildtigerhealthcentre.org/wp-content/uploads/2020/04/WTHC_Info_sheet-How_to_respond_to_meeting_a_tiger.pdf',
  },

  // Reptiles
  {
    rank: 'species',
    taxon: 'vipera berus',
    commonName: 'adders',
    note: 'The adder is the UK’s only venomous snake. If bitten, call 999 or go to A&E (don’t drive yourself), keep the bitten part as still as you can, and don’t cut or suck the bite or take aspirin or ibuprofen. Most UK snake bites are not serious, but all need medical help.',
    source: 'NHS — Snake bites',
    sourceUrl: 'https://www.nhs.uk/conditions/snake-bites/',
  },
  ...(
    [
      ['pseudonaja', 'brown snakes'],
      ['oxyuranus', 'taipans'],
      ['notechis', 'tiger snakes'],
      ['acanthophis', 'death adders'],
      ['pseudechis', 'black snakes'],
    ] as const
  ).map(([taxon, commonName]): WildlifeNote => ({
    rank: 'genus',
    taxon,
    commonName,
    note: `Australian ${commonName} have venom that can kill. Treat any bite as a medical emergency: call 000, keep the person still and calm, and apply a pressure bandage. Don’t wash, cut or suck the bite or use a tourniquet.`,
    source: 'healthdirect Australia — Snake bites',
    sourceUrl: 'https://www.healthdirect.gov.au/snake-bites',
  })),
  {
    rank: 'species',
    taxon: 'crocodylus porosus',
    commonName: 'saltwater crocodiles',
    note: 'Saltwater crocodiles can attack from very shallow water and turn up in any waterway in their range. Keep out of the water, stay more than 5 m from the water’s edge, and keep children away from it.',
    source: 'Queensland Government — Be Crocwise',
    sourceUrl:
      'https://www.qld.gov.au/environment/plants-animals/animals/living-with/crocodiles/becrocwise/be-crocwise-top-tips',
  },
  {
    rank: 'species',
    taxon: 'crocodylus niloticus',
    commonName: 'Nile crocodiles',
    note: 'The Nile crocodile is one of the world’s most dangerous reptiles, responsible for several hundred confirmed human deaths a year. Most attacks happen near the water’s edge, where people wash clothes, get in and out of boats or walk along the shore.',
    source: 'Encyclopaedia Britannica — Nile crocodile',
    sourceUrl: 'https://www.britannica.com/animal/Nile-crocodile',
  },
  {
    rank: 'species',
    taxon: 'melanosuchus niger',
    commonName: 'black caimans',
    note: 'Black caimans are dangerous to people; several dozen attacks on people have been reported since 2000.',
    source: 'Encyclopaedia Britannica — Black caiman',
    sourceUrl: 'https://www.britannica.com/animal/black-caiman',
  },
  {
    rank: 'species',
    taxon: 'dendroaspis polylepis',
    commonName: 'black mambas',
    note: 'Black mambas have neurotoxic venom and are greatly feared because of the high proportion of envenomed people who die.',
    ...WHO_SNAKES,
  },
  {
    rank: 'species',
    taxon: 'bitis arietans',
    commonName: 'puff adders',
    note: 'Puff adders are widespread in sub-Saharan Africa and the Arabian Peninsula and cause many snakebites that result in permanent disability and death.',
    ...WHO_SNAKES,
  },
  {
    rank: 'species',
    taxon: 'ophiophagus hannah',
    commonName: 'king cobras',
    note: 'King cobra bites can cause local swelling and paralysis, and very rapid deaths after a bite have been reported. Get the person to hospital as fast as possible.',
    ...WHO_SEARO_SNAKEBITE,
  },
  ...(
    [
      ['naja naja', 'Indian cobra'],
      ['daboia russelii', 'Russell’s viper'],
      ['bungarus caeruleus', 'common krait'],
      ['echis carinatus', 'saw-scaled viper'],
    ] as const
  ).map(([taxon, commonName]): WildlifeNote => ({
    rank: 'species',
    taxon,
    commonName,
    note: `The ${commonName} is one of India’s “big four” medically important venomous snakes, whose venoms are used to make Indian antivenom. Get anyone bitten to hospital as fast as possible.`,
    ...WHO_SEARO_SNAKEBITE,
  })),
  {
    rank: 'genus',
    taxon: 'daboia',
    commonName: 'Russell’s vipers',
    note: 'Russell’s vipers cause thousands of snakebite envenomings in South and South-East Asia; in Myanmar their bites are a major cause of acute kidney injury needing dialysis.',
    ...WHO_SNAKES,
  },
  {
    rank: 'genus',
    taxon: 'bungarus',
    commonName: 'kraits',
    note: 'Kraits have potent neurotoxic venom and often enter homes at night, biting people sleeping unprotected on the floor. Sleeping on a raised platform under a well-tucked-in mosquito net can prevent krait bites.',
    ...WHO_SNAKES,
  },
  {
    rank: 'genus',
    taxon: 'bothrops',
    commonName: 'lanceheads',
    note: 'Throughout Latin America, lanceheads (genus Bothrops, including the fer-de-lance) are the major cause of snakebite death and disability.',
    ...WHO_SNAKES,
  },

  // Amphibians
  {
    rank: 'genus',
    taxon: 'phyllobates',
    commonName: 'poison dart frogs',
    note: 'A wild golden poison frog (Phyllobates terribilis) carries about 1,900 micrograms of batrachotoxin, while 2–200 micrograms is thought to be lethal to people; toxin rubbed onto facial skin has caused burning for hours. Don’t touch wild Phyllobates frogs.',
    source: 'Animal Diversity Web (University of Michigan) — Phyllobates terribilis',
    sourceUrl: 'https://animaldiversity.org/accounts/Phyllobates_terribilis/',
  },
  {
    rank: 'species',
    taxon: 'rhinella marina',
    commonName: 'cane toads',
    note: 'A pet that bites or swallows a cane toad will become sick and may die — take it to a vet right away. Signs include heavy drooling, very red gums, head-shaking, crying, loss of coordination and sometimes convulsions. Walk dogs on a short leash at dusk and after dark; the toxin can also irritate people’s skin and eyes.',
    source: 'University of Florida IFAS — Help prevent cane toads from poisoning your pet',
    sourceUrl:
      'https://blogs.ifas.ufl.edu/news/2019/03/28/uf-expert-help-prevent-cane-toads-from-poisoning-your-pet',
  },
  ...MARINE_NOTES,
];

/** Shown for every droppings photo. */
export const SIGN_HYGIENE: WildlifeNote = {
  rank: 'order',
  taxon: '*',
  commonName: 'animal droppings',
  sign: 'scat',
  note: 'Don’t touch animal droppings with bare hands, and wash your hands after being outdoors.',
  source: 'CDC — About Baylisascaris',
  sourceUrl: 'https://www.cdc.gov/baylisascaris/about/index.html',
};

function candidateRank(c: OrganismCandidate, rank: Rank): string | undefined {
  const value =
    rank === 'order'
      ? c.order
      : rank === 'family'
        ? c.family
        : rank === 'genus'
          ? (c.genus ?? c.scientificName.split(/\s+/)[0])
          : c.scientificName.split(/\s+/).slice(0, 2).join(' ');
  return value?.trim().toLowerCase();
}

export function findWildlifeNotes(c: OrganismCandidate, feature?: string): WildlifeNote[] {
  return WILDLIFE_NOTES.filter(
    (n) => candidateRank(c, n.rank) === n.taxon && (!n.sign || feature === 'scat'),
  );
}

/**
 * Safety notes for animals: warnings about the top candidate and, when the
 * identification is uncertain, about other likely candidates. Never says an
 * animal is harmless.
 */
export function buildWildlifeSafety(input: {
  band: ConfidenceBand;
  candidates: OrganismCandidate[];
  /** The part photographed ("scat", "track", …) when known. */
  feature?: string;
}): SafetyInfo | undefined {
  const [top, ...rest] = input.candidates;
  if (!top) return undefined;
  const toStatement = (n: WildlifeNote, subject?: string): SafetyStatement => ({
    kind: 'caution',
    text: n.note,
    subject,
    basis: n.rank === 'species' ? 'species' : undefined,
    severity: 'caution',
    source: n.source,
    sourceUrl: n.sourceUrl,
  });
  const statements: SafetyStatement[] = findWildlifeNotes(top, input.feature).map((n) =>
    toStatement(n),
  );
  const seen = new Set(statements.map((s) => s.text));
  const others = input.band === 'high' ? [] : rest.slice(0, 2);
  for (const c of others) {
    const name = c.commonName ? `${c.commonName} (${c.scientificName})` : c.scientificName;
    for (const n of findWildlifeNotes(c, input.feature)) {
      if (seen.has(n.note)) continue;
      seen.add(n.note);
      statements.push(toStatement(n, name));
    }
  }
  if (input.feature === 'scat') statements.push(toStatement(SIGN_HYGIENE));
  if (!statements.length) return undefined;
  return { statements, level: 'caution', kind: 'wildlife' };
}
