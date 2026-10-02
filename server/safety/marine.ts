/**
 * Beach and sea safety notes, merged into WILDLIFE_NOTES (wildlife.ts). Same editing rules.
 * Every note was checked against its linked page on 2026-10-02.
 * Warnings only: nothing here says an organism is harmless or safe to handle or eat.
 */
import type { WildlifeNote } from './wildlife.js';

const HEALTHDIRECT_SEA = {
  source: 'healthdirect Australia — Sea creature bites and stings',
  sourceUrl: 'https://www.healthdirect.gov.au/sea-creature-stings',
};
const DAN_BOATER = {
  source: 'DAN Boater (Divers Alert Network) — First aid for hazardous marine life injuries',
  sourceUrl:
    'https://danboater.org/travel-health-and-safety/first-aid-for-hazardous-marine-life-injuries.html',
};
const DAN_INVERTEBRATES = {
  source: 'Divers Alert Network — Marine envenomations: invertebrates',
  sourceUrl: 'https://dan.org/alert-diver/article/marine-envenomations-invertebrates/',
};
const MEDLINEPLUS_JELLYFISH = {
  source: 'MedlinePlus (US National Library of Medicine) — Jellyfish stings',
  sourceUrl: 'https://medlineplus.gov/ency/article/002845.htm',
};
const NPS_VIIS_HAZARDS = {
  source: 'US National Park Service — Virgin Islands NP: things to avoid while in the water',
  sourceUrl: 'https://www.nps.gov/viis/planyourvisit/marine-hazards.htm',
};
const CFIA_SHELLFISH = {
  source: 'Canadian Food Inspection Agency — Marine biotoxins in bivalve shellfish (PSP, ASP, DSP)',
  sourceUrl:
    'https://inspection.canada.ca/en/food-safety-consumers/fact-sheets/specific-products-and-risks/fish-and-seafood/toxins-shellfish',
};

export const MARINE_NOTES: WildlifeNote[] = [
  // ---- Box jellyfish (class Cubozoa: orders Chirodropida, Carybdeida) ----
  ...(['chirodropida', 'carybdeida'] as const).map((taxon): WildlifeNote => ({
    rank: 'order',
    taxon,
    commonName: 'box jellyfish',
    note: 'Box jellyfish and Irukandji are the most dangerous tropical stingers; a box jellyfish sting can cause unconsciousness and cardiac arrest. In Australia call 000; start CPR if needed, and pour vinegar on the sting for at least 30 seconds, then pick off the tentacles.',
    ...HEALTHDIRECT_SEA,
  })),
  ...(['chirodropida', 'carybdeida'] as const).map((taxon): WildlifeNote => ({
    rank: 'order',
    taxon,
    commonName: 'box jellyfish',
    note: 'Box jellyfish live in tropical waters including Hawaii, Guam, the Caribbean and Florida, and some stings can kill within minutes or cause a delayed Irukandji syndrome. Watch anyone stung for hours, and get medical help right away for breathing difficulty, chest or abdominal pain, or heavy sweating.',
    ...MEDLINEPLUS_JELLYFISH,
  })),
  {
    rank: 'genus',
    taxon: 'carukia',
    commonName: 'Irukandji jellyfish',
    note: 'An Irukandji sting feels minor at first, but 5 to 40 minutes later it can cause Irukandji syndrome: muscle pain, headache, nausea and vomiting, sweating and restlessness. Call 000, start CPR if needed, and pour vinegar on the sting for at least 30 seconds.',
    ...HEALTHDIRECT_SEA,
  },

  // ---- Other stinging cnidarians ----
  {
    rank: 'genus',
    taxon: 'physalia',
    commonName: 'Portuguese man o’ war / bluebottles',
    note: 'Bluebottle (Portuguese man o’ war) stings cause intense pain straight away. Wash tentacles off with seawater, not fresh water, and soak the area in hot water (no hotter than easily tolerated) for 20 minutes; don’t use vinegar, as it may make the pain worse. Get urgent care for severe symptoms.',
    ...HEALTHDIRECT_SEA,
  },
  {
    rank: 'genus',
    taxon: 'physalia',
    commonName: 'Portuguese man o’ war / bluebottles',
    note: 'A man o’ war’s stinging cells can still fire even if it looks dead, so avoid touching one or its tentacles in the water or washed up on the shore. Anyone stung should get a medical evaluation, as severe allergic reactions can affect the heart and breathing.',
    ...DAN_BOATER,
  },
  ...(
    [
      ['chrysaora', 'sea nettles'],
      ['cyanea', 'lion’s mane jellyfish'],
    ] as const
  ).map(([taxon, commonName]): WildlifeNote => ({
    rank: 'genus',
    taxon,
    commonName,
    note: `${commonName === 'sea nettles' ? 'Sea nettles' : 'Lion’s mane jellyfish'} are among the jellyfish whose stinging tentacles can hurt you. If stung, rinse with plenty of vinegar for at least 30 seconds (or seawater if you have none), don’t rub the area, then soak it in hot (not scalding) water for 20 to 40 minutes; get medical help right away for breathing difficulty or chest pain.`,
    ...MEDLINEPLUS_JELLYFISH,
  })),
  {
    rank: 'genus',
    taxon: 'millepora',
    commonName: 'fire coral',
    note: 'Fire coral causes a burning sting and rash, and cuts from it can become badly infected. Don’t touch it — it is easily confused with other hard corals. If stung, rinse with household vinegar, don’t pop any blisters, and see a doctor for open wounds.',
    ...DAN_BOATER,
  },

  // ---- Venomous molluscs ----
  {
    rank: 'genus',
    taxon: 'hapalochlaena',
    commonName: 'blue-ringed octopus',
    note: 'Blue-ringed octopus bites are very dangerous and can cause death, even though the bite is often painless. Don’t touch one; if bitten, call 000, apply a pressure immobilisation bandage if the bite is on a limb, keep the person still and give CPR if needed.',
    ...HEALTHDIRECT_SEA,
  },
  {
    rank: 'family',
    taxon: 'conidae',
    commonName: 'cone snails',
    note: 'Cone snail stings are very dangerous and can cause death; the muscle weakness they cause can make it hard to breathe. Don’t touch cone shells; if stung, call 000, apply a pressure immobilisation bandage if the sting is on a limb, keep the person still and give CPR if needed.',
    ...HEALTHDIRECT_SEA,
  },

  // ---- Spiny echinoderms ----
  {
    rank: 'genus',
    taxon: 'acanthaster',
    commonName: 'crown-of-thorns starfish',
    note: 'Crown-of-thorns starfish spines are sharp enough to pierce a thick wetsuit and release a toxin that causes significant pain, nausea and vomiting. If spiked, immerse the wound in hot (not scalding) water, remove spines only if they come out cleanly, wash with soap and water, and watch for infection — puncture wounds are especially prone to it.',
    ...DAN_INVERTEBRATES,
  },
  // Regular sea urchin orders; the source covers sea urchins generally.
  ...(['diadematoida', 'camarodonta', 'arbacioida', 'cidaroida', 'echinothurioida'] as const).map(
    (taxon): WildlifeNote => ({
      rank: 'order',
      taxon,
      commonName: 'sea urchins',
      note: 'Most sea urchin injuries happen when they’re stepped on or picked up, leaving painful spines in the skin. Remove spines close to the surface, soak the area in water as hot as can easily be tolerated for 20 minutes, and see a doctor to have deeper spines removed.',
      ...HEALTHDIRECT_SEA,
    }),
  ),

  // ---- Venomous fish ----
  {
    rank: 'order',
    taxon: 'myliobatiformes',
    commonName: 'stingrays',
    note: 'A stingray’s tail barb can cause deep, painful wounds and severe bleeding, and often breaks off in the wound. Shuffle your feet when entering shallow water; if stung, clean the wound, control bleeding and get medical care straight away, as these wounds often become infected.',
    ...DAN_BOATER,
  },
  {
    rank: 'genus',
    taxon: 'synanceia',
    commonName: 'stonefish',
    note: 'Stonefish look like rocks and their back spines inject a venom that makes them very dangerous. If stung, call 000, leave the spine in unless told otherwise, and soak the area in hot water (no hotter than easily tolerated) for up to 30 minutes; antivenom is available.',
    ...HEALTHDIRECT_SEA,
  },
  {
    rank: 'genus',
    taxon: 'pterois',
    commonName: 'lionfish',
    note: 'Lionfish have venomous spines on the top and underside of the body; stings cause pain and swelling, and in extreme cases skin damage and paralysis. If stung, seek medical attention promptly, remove any obvious spine pieces and apply hot water (as hot as you can stand without scalding) until the pain eases.',
    source: 'NOAA National Marine Sanctuaries — How to catch and cook lionfish',
    sourceUrl: 'https://sanctuaries.noaa.gov/qr/lionfish/',
  },
  {
    rank: 'family',
    taxon: 'scorpaenidae',
    commonName: 'scorpionfish',
    note: 'Scorpionfish are well camouflaged and have venomous spines on their fins that cause swelling and intense pain. Shuffle your feet and don’t touch the sea floor; if stung, soak in hot water and seek immediate medical attention if an allergic reaction occurs.',
    ...NPS_VIIS_HAZARDS,
  },
  {
    rank: 'family',
    taxon: 'trachinidae',
    commonName: 'weever fish',
    note: 'Weever fish live buried in sand and can sting if disturbed, causing intense pain. Wear water shoes in the shallows; if stung, rinse with seawater, remove spines with tweezers (not fingers) and soak the area in water as warm as you can tolerate; ask a lifeguard for help.',
    source: 'NHS inform — Jellyfish and sea creature stings',
    sourceUrl:
      'https://www.nhsinform.scot/illnesses-and-conditions/injuries/skin-injuries/jellyfish-and-sea-creature-stings/',
  },

  // ---- Sea snakes ----
  ...(
    [
      ['hydrophis', 'sea snakes'],
      ['aipysurus', 'sea snakes'],
      ['laticauda', 'sea kraits'],
    ] as const
  ).map(([taxon, commonName]): WildlifeNote => ({
    rank: 'genus',
    taxon,
    commonName,
    note: 'Sea snake bites are very dangerous and can cause death. If bitten, call 000, apply a pressure immobilisation bandage if the bite is on a limb, keep the person calm and still, and give CPR if needed.',
    ...HEALTHDIRECT_SEA,
  })),

  // ---- Fireworms ----
  {
    rank: 'family',
    taxon: 'amphinomidae',
    commonName: 'fireworms',
    note: 'Fireworms have thousands of fine, venom-filled bristles that break off in the skin, causing pain, burning, itching and redness. Don’t touch them; bristles may be lifted out with adhesive tape.',
    ...NPS_VIIS_HAZARDS,
  },

  // ---- Wild-harvested bivalve shellfish (PSP etc.) ----
  // Mussels, clams, oysters, scallops, cockles; Myida/Adapedonta cover soft-shell and razor clams.
  ...(
    ['mytilida', 'venerida', 'ostreida', 'pectinida', 'cardiida', 'myida', 'adapedonta'] as const
  ).map((taxon): WildlifeNote => ({
    rank: 'order',
    taxon,
    commonName: 'clams, mussels, oysters & scallops',
    note: 'Bivalve shellfish can build up toxins from microscopic algae that cause paralytic shellfish poisoning, which can be fatal; cooking does not destroy them. Check with local authorities that an area is open before harvesting, and seek medical attention immediately if you feel ill after eating shellfish.',
    ...CFIA_SHELLFISH,
  })),
];
