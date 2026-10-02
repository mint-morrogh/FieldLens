# Stage 1: sea life, seaweed and a sectioned picker

Status: built (2026-10-02). Next: the owner's beach photos (record results below).

## Why

Crabs photographed at the beach came back with no identification and no category to tag. BioCLIP 2 already knows these animals, but FieldLens maps every BioCLIP match to one of its categories (`categoryForTaxon` in `server/providers/bioclip/bioclipProvider.ts`), and crabs, molluscs, sea stars, jellyfish and seaweed have none, so they fall into `'other'`. The fish category is backboned animals only, so octopus and squid are excluded too.

## Data coverage (checked, not assumed)

Counted from BioCLIP 2's own label file (`TreeOfLife-200M/embeddings/txt_emb_species.json`, 867,455 taxa), the same list the Space searches. Spot checks found Carcinus, Cancer, Pagurus (hermit crab), Homarus, Armadillidium (pillbug), Balanus, Limulus (horseshoe crab), Octopus, Mytilus, Aurelia (moon jelly), Pisaster, Asterias, Halichondria, Ciona, Fucus, Ascophyllum, Laminaria, Macrocystis and Ulva.

| New category | BioCLIP scope | Taxa | iNaturalist taxon | GBIF kingdom |
|---|---|---|---|---|
| Crustacean | class Malacostraca, Maxillopoda (barnacles), Branchiopoda; + Merostomata (horseshoe crab, 27) | ~14.4k | 85493 Crustacea (+ 246165 Xiphosurida) | Animalia |
| Mollusc | phylum Mollusca (Gastropoda 45.7k, Bivalvia 9.2k, Cephalopoda 2.2k, chitons 626) | ~58k | 47115 Mollusca (iconic) | Animalia |
| Sea star & urchin | phylum Echinodermata | ~4.9k | 47549 | Animalia |
| Jelly, anemone & coral | phylum Cnidaria (Anthozoa 5k, Hydrozoa 1.5k, Scyphozoa 153, Cubozoa 22) + Ctenophora | ~6.8k | 47534 | Animalia |
| Other sea life | Porifera (sponges 3.3k), Ascidiacea (sea squirts 632), Annelida (worms 3.2k), Bryozoa, Nemertea | ~11k | per phylum | Animalia |
| Seaweed | class Phaeophyceae (brown, 842, kingdom Chromista); phylum Rhodophyta (red, 3.2k) and Chlorophyta (green, 1.4k), both kingdom Plantae | ~5.5k | 48220, 57774, 50863 | mixed: Chromista or Plantae |

Left out on purpose: microscopic groups (copepods, ostracods, plankton, diatoms, rotifers, tardigrades). You can't photograph them with a phone, and BioCLIP 2 scores 1–6% on plankton.

Other sources need no new data. GBIF occurrences, Wikidata and Wikipedia work for any taxon. Rows marked "per phylum" or "mixed" need small code changes (below), not new datasets.

## Work

1. **Categories**: add `crustacean`, `mollusc`, `echinoderm`, `cnidarian`, `seaLife`, `seaweed` to `OrganismCategory`, `shared/schemas.ts`, `shared/categories.ts` (scope, blurb, photo parts, advice), the provider registry and `categoryForTaxon`.
2. **Split herps**: Reptile and Amphibian become separate picker entries; the `herp` group stays in the server for old history and links.
3. **Fix routing**:
   - Red and green algae are kingdom Plantae in BioCLIP. Route those phyla to `seaweed` before the `Plantae → plant` rule, so "Not sure" never sends seaweed to Pl@ntNet.
   - Sea squirts (Ascidiacea) and other non-fish Chordata classes stop falling into `fish`.
4. **iNaturalist**: crustaceans, echinoderms and the rest have no iconic taxon, so the provider takes an optional `inaturalistTaxonIds` and filters with `taxon_id`.
5. **GBIF**: seaweed spans two kingdoms; name matching uses the candidate's own kingdom from BioCLIP instead of the category's.
6. **Picker**: a sectioned dropdown (see below) in place of the chip row.
7. **Safety** (`server/safety/wildlife.ts`), sourced from agency pages, as with the other notes:
   - stings: box jellyfish, Portuguese man o' war, fire coral
   - venom: blue-ringed octopus, cone snails, crown-of-thorns, urchin spines
   - shellfish: a standing "never eat wild shellfish based on an app" line (paralytic shellfish poisoning, red tide), treated like mushrooms. Food uses are never shown.
8. **Journal and icons**: new journal groups, `shared/nearby.ts` enum, and new line icons (crab, snail/octopus, sea star, jellyfish, sponge, kelp).
9. **Tests**: unit tests for `categoryForTaxon` with the spot-check taxa above, the picker scopes, and mock fixtures for a crab and a kelp.

## Picker design

The goal is quick to use, while letting a pick narrow the search. Each section header can be picked itself: "Sea & shore" searches every sea group at once. A rough pick still helps the model, and nobody has to know taxonomy.

```
Not sure — FieldLens works it out
─ Plants & fungi ─────────────  (pick all)
  Plant · Tree · Fungus · Seaweed
─ Land animals ───────────────  (pick all)
  Bug · Bird · Mammal · Reptile · Amphibian
─ Sea & shore ────────────────  (pick all)
  Fish · Crab & shrimp · Snail, clam & octopus
  Sea star & urchin · Jelly, anemone & coral · Sponges, worms & more
```

Mammals stay one entry, with no rodent, deer or bat sub-choices. Picking Mammal already narrows the search to about 6k of 867k taxa, and a wrong sub-pick would hurt more than it helps. Tracks and droppings stay under Mammal.

## Done when

- A crab, octopus, sea star, jellyfish and kelp photo each get a category under "Not sure" and under their own pick (mock + real Space).
- The owner's beach photos: results recorded in this doc.
- Unit tests and the focused E2E for the picker pass; full regression at the end.

## Results (2026-10-02)

Built as planned, plus finer picks for every group (see DECISIONS.md, "Sea life, seaweed, moss and a sectioned sheet"). The picker became a searchable bottom sheet rather than a plain dropdown: with ~35 choices, search and section jumps beat scrolling.

**Live check** (`tests/live/picks.live.test.ts`, one openly licensed research-grade iNaturalist photo per species, real Space):

- All 23 cases landed in the expected group under the pick a person would choose. That includes a newt picked as "Lizard" (it says Amphibian) and a monarch wrongly picked as "Beetle" (it widened to Any bug).
- The first run found a bug: a moon jelly was outvoted by microscopic plankton look-alikes, so plankton no longer votes. The jellyfish, anemone and sponge cases passed on rerun.

Beach photos under "Not sure" and under their pick:

| Photo | Not sure → | Pick → | Top match | Genus |
|---|---|---|---|---|
| European green crab | crustacean | Crab, lobster & shrimp → crustacean | *Carcinus maenas* | ✓ |
| Long-clawed hermit crab | crustacean | Crab… → crustacean | *Pagurus longicarpus* | ✓ |
| Asian shore crab | crustacean | Anything from the beach → crustacean | *Hemigrapsus nudus* | ✓ |
| Atlantic horseshoe crab | crustacean | Crab… → crustacean | *Carcinoscorpius rotundicauda* (another horseshoe crab) | |
| Acorn barnacle | crustacean | Crab… → crustacean | *Catomerus polymerus* (another barnacle) | |
| Common octopus | mollusc | Octopus & squid → mollusc | *Paroctopus digueti* | |
| Blue mussel | mollusc | Clam, mussel & oyster → mollusc | *Mytilus trossulus* | ✓ |
| Common periwinkle | mollusc | Snail & slug → mollusc | *Oxygyrus inflatus* | |
| Ochre sea star | echinoderm | Starfish & sea urchin → echinoderm | *Pisaster ochraceus* | ✓ |
| Purple sea urchin | echinoderm | Starfish… → echinoderm | *Strongylocentrotus purpuratus* | ✓ |
| Moon jelly | cnidarian | Jellyfish… → cnidarian | *Aurelia aurita* | ✓ |
| Knotted wrack | seaweed | Seaweed → seaweed | *Ascophyllum nodosum* | ✓ |
| Sea lettuce | seaweed | Anything from the beach → seaweed | *Ulva lactuca* | ✓ |

So: the right group 13/13 and the right genus 9/13. One photo per species is a smoke test, not a benchmark.

**Known gaps**

- The moon jelly is named correctly, but its confidence shows only ~2%. BioCLIP splits the score across many similar-looking jellies. The Space now also leaves microscopic taxa out of every search (deployed 2026-10-02), which only raised it from 1% to 2%. Expect jellyfish to read as "possible" matches.
- Periwinkle and octopus were right only at group level. More photos would help (shell opening, whole animal).

## Owner's beach photos

_To fill in._
