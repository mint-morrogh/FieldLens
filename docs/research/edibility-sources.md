# Edibility & toxicity data sources

_Research date: 2026-09-27. Goal: show sourced edibility/toxicity notes for plants and mushrooms without ever saying “safe to eat”. Re-verify licences before shipping._

## Summary

| Source | Coverage | What it gives | Access | Licence | Use? |
| --- | --- | --- | --- | --- | --- |
| Wikidata P789 “edibility” | ~1,230 fungi | category (edible, choice, poisonous, deadly, psychoactive, edible when cooked, caution…) | SPARQL / wbgetclaims via our GBIF-ID lookup | CC0 | **Yes — mushrooms** (drop “medicinal”) |
| Wikidata, other properties | plants | nothing reliable (no toxicity property; LD50-via-compounds is misleading) | — | CC0 | No |
| Wikipedia (en) | most species | “Toxicity”, “Uses”, “Similar species” sections; mushroom infobox `howEdible` | MediaWiki Action API (sections + plain-text extracts) | CC BY-SA 4.0 | **Yes — quoted sentences with link + licence notice** |
| TPPT (Agroscope, Zenodo) | ~850 Central-European plants | toxic part, human/animal toxicity grade | CSV/XLSX download | CC BY 4.0 | **Yes — small bundled dataset** (+ genus-level fallback, clearly labelled) |
| World Checklist of Useful Plant Species (Kew) | ~40k species | “food” / “poison” use flags only | bulk download | CC BY 4.0 | Hint only |
| PFAF | ~8k plants | edibility/medicinal ratings, hazards | HTML only | mixed (text CC BY/SA, images NC-ND) | Manual citation only |
| USDA PLANTS | US flora | livestock-oriented `Toxicity` field | undocumented API / CSV | public domain | **No** — dangerously incomplete (e.g. pokeweed “Slight”) |
| Canadian Poisonous Plants Information System | 259 plants | — | retired 2021 | — | No |
| FDA Poisonous Plant Database | — | — | taken down 2022 | — | No |
| ASPCA pet toxicity list | ~1k plants | pet toxicity | no API; terms forbid copying/bots | — | Link out only |
| NAMA poison case registry | North American cases | yearly PDFs | no dataset | — | Link out (“report a poisoning”) |

Sources: [Wikidata P789](https://www.wikidata.org/wiki/Property:P789), [MediaWiki parse API](https://www.mediawiki.org/wiki/API:Parsing_wikitext), [Wikipedia reuse](https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content), [Mycomorphbox](https://en.wikipedia.org/wiki/Template:Mycomorphbox), [TPPT on Zenodo](https://zenodo.org/records/15758276), [Agroscope TPPT](https://www.agroscope.admin.ch/en/toxic-plants-phytotoxin-tppt-database), [TPPT paper](https://pubs.acs.org/doi/10.1021/acs.jafc.8b01639), [Useful Plant Species](https://knb.ecoinformatics.org/view/doi:10.5063/F1CV4G34), [PFAF licence](https://pfaf.org/user/cmspage.aspx?pageid=136), [USDA PLANTS downloads](https://plants.usda.gov/downloads), [CBIF retirement](https://agriculture.canada.ca/en/agricultural-science-and-innovation/canadian-biodiversity-information-facility-cbif), [ASPCA terms](https://www.aspca.org/about-us/legal-information), [NAMA registry](https://namyco.org/interests/toxicology/nama-toxicology-reports-and-poison-case-registry/), [Wikimedia rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits).

## Spot checks

- Wikipedia has “Toxicity” sections for *Actaea rubra*, *Sambucus canadensis*, *Phytolacca americana*, *Solanum dulcamara*, *Amanita phalloides*; key facts are sometimes elsewhere (*Taxus canadensis*: “All parts … save the aril, are toxic” under “Uses and traditions”). The page summary alone often misses them.
- Wikidata P789: *Cantharellus cibarius* edible/choice; *Morchella esculenta* edible / edible when cooked; *Amanita muscaria* poisonous/psychoactive; *A. phalloides* deadly (plus a stray “medicinal” value to filter out).
- TPPT has the right fields but only Swiss species, so *Taxus canadensis*, *Actaea rubra*, *Sambucus canadensis* are missing (genus-level fallback helps).

## Recommended approach

- **Plants/berries:** bundle TPPT (toxic part + human toxicity grade, attributed to Günthardt et al. 2018 / Zenodo) with a clearly labelled genus-level fallback; at request time pull Wikipedia section text and quote sentences mentioning toxic/poison/edible/eaten/cooked/raw with a link and CC BY-SA notice.
- **Mushrooms:** Wikidata P789 via the existing GBIF-ID lookup, falling back to Wikipedia’s `howEdible`; look-alikes from “Similar species”/“Similarity to edible species” sections; always a caution line and a NAMA link.
- **Gaps:** no authoritative machine-readable North American plant toxicity source exists. Consider a small hand-curated list of ~30 high-risk PEI species (water hemlock, baneberry, yew, bittersweet nightshade, pokeweed, *Amanita*…), each entry citing its source.
- **Operational:** one SPARQL + two Action API calls per species; cache by GBIF key; send a contact User-Agent (Wikimedia limits anonymous clients); keep concurrency low.
