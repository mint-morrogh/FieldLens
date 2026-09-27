# Identification providers for non-plant organisms

_Research date: 2026-09-27. Pricing, access and licences change — re-verify before signing up or launching publicly. Sources are linked inline; claims we could not verify directly are marked._

## TL;DR

| Group | Recommended provider | Why | Owner action |
| --- | --- | --- | --- |
| **Insects & spiders** (+ snails, slugs, centipedes) | **Kindwise insect.id** (hosted API) | Ready today, ~14k taxa, takes location + date, returns probabilities plus danger/role/red-list details. ~1 day to integrate. | Kindwise account + credits |
| **Fungi** (incl. lichens, slime molds) | **Kindwise mushroom.id** (hosted API) | Only commercially licensed, ready-made fungi API found (~5k classes). ~1 day to integrate **plus mandatory safety work**. | Same Kindwise account (separate key) + credits |
| **Birds** | **BioCLIP 2, self-hosted on Modal**, restricted to species seen nearby (eBird + GBIF) | No usable hosted bird photo-ID API exists. BioCLIP 2 is MIT-licensed and covers the whole tree of life. | Modal account (card on file), eBird API key |
| **Mammals, reptiles, amphibians** | **BioCLIP 2** (same service, different taxon filters) | No specialized public API exists for these groups. | — (same Modal service) |
| **Bird sounds** (later) | **BirdNET**, running in the browser | Excellent for birds; the official BirdNET Live PWA already does on-device detection. | Licence check before any public launch |
| **“Auto” category** | BioCLIP 2 at class/kingdom level | One cheap extra call on the same service. | — |

**Not viable:** the iNaturalist computer-vision API (partner-only, fee-based, and unofficial use is being blocked) and general LLMs as the species identifier (poor accuracy and poorly calibrated confidence — they’re fine for picking the category or explaining features, never for the final answer or facts).

**Suggested order:** (1) insects + spiders → (2) fungi with the safety package → (3) BioCLIP 2 service + Auto category → (4) birds with eBird priors → (5) mammals, reptiles, amphibians → (6) bird sound.

## What fits our architecture

Every option below plugs into the existing `IdentificationProvider` interface (1–5 cropped JPEGs + optional ~1 km location + date → ranked species with scores). GBIF/iNaturalist enrichment, reranking, galleries, the analysis screen and history all work unchanged. The two structural additions are:

- **A small model service** (Python, on [Modal](https://modal.com/pricing)) for BioCLIP 2, because the model (~1.7 GB weights, ViT-L) can’t run in a Vercel function.
- **A local “species list” prior** passed to that service: species recorded near the user (GBIF occurrence facets we already query; eBird nearby observations for birds). BioCLIP 2 has no location input, but [pybioclip](https://github.com/Imageomics/pybioclip) can restrict predictions to a given taxon list.

## Findings by option

### Kindwise insect.id and mushroom.id (hosted APIs)

- **Coverage:** insect.id 14k+ taxa including spiders, centipedes, snails, slugs, worms ([insect.id](https://www.kindwise.com/insect-id)); mushroom.id “almost 5,000” classes including lichens and slime molds ([mushroom.id](https://www.kindwise.com/mushroom-id)). No bird, mammal or herp product.
- **Input:** up to 5 images per identification, optional latitude, longitude and datetime (“increases the identification accuracy”), `similar_images`, taxon filters ([FAQ](https://www.kindwise.com/faq), [examples](https://github.com/flowerchecker/mushroom-id-examples), [API docs](https://documenter.getpostman.com/view/3802128/2s93sZ5YeU)).
- **Output:** suggestions with probabilities, plus optional details — insect.id: common names, taxonomy, GBIF/iNat IDs, danger, role, red list; mushroom.id: edibility, psychoactive, look-alikes, characteristics.
- **Vendor accuracy claims (unverified by us):** insect.id 92% precision / right answer in the top 3 ~90% of the time; mushroom.id 88% top-3.
- **Pricing:** 100 free credits; 1 credit per identification; roughly €0.05 down to €0.01 per credit depending on pack size, €50 minimum pack; small packs don’t expire ([pricing](https://www.kindwise.com/pricing)). No hard rate cap on paid plans; ~0.5 s typical response.
- **Terms to be aware of** ([API T&C v3](https://cdn.prod.website-files.com/64876ae345f1e27598fafc02/6853d59465d761e68644128a_KW%20API%20T%26C%20v3.docx.pdf)): commercial use allowed; **uploaded photos are licensed to Kindwise irrevocably, including for training and CC-BY-SA republication (§17.5)** — our privacy page must say so; Kindwise disclaims liability for misidentification; CC-BY “similar images” need attribution (our gallery already credits every photo). Each product needs its own key; calls must go through our server (they already do).
- **Integration effort:** low — one REST call from a new provider class.

### BioCLIP 2 / 2.5 (open model, self-hosted)

- **What it is:** a CLIP-style model trained on TreeOfLife-200M (952k taxa), MIT licence ([model card](https://huggingface.co/imageomics/bioclip-2), [paper](https://arxiv.org/abs/2505.23883)). It picks the best match from a list of names we give it, at any rank from kingdom to species. BioCLIP 2.5 (ViT-H) is slightly better and heavier ([2.5](https://huggingface.co/imageomics/bioclip-2.5-vith14)).
- **Published zero-shot accuracy** (model card): mean ~55.6% across 10 benchmarks; NABirds 74.9, Insects 55.3, Camera Trap 53.9, Rare Species 76.8. A 96.8% “fungi” figure is from a 25-class set, so it says little about thousands of species. On the hard, real-world RealBirdID benchmark the original BioCLIP managed 17% species / 57% genus ([paper](https://arxiv.org/html/2603.27033)).
- **What that means for us:** restricting predictions to species actually recorded nearby should help a lot (far fewer choices), and our genus-level answers (“Probably a warbler”) matter even more here. We should measure accuracy on real phone photos before calling it production-ready.
- **Hosting:** Modal bills per second and scales to zero (T4 GPU ≈ $0.59/h; $30/month free compute on the Starter plan); Hugging Face Inference Endpoints are an alternative (T4 $0.50/h, CPU from $0.033/h). Expect a few seconds of cold start after idle. At family volume this should stay within or near Modal’s free credit (estimate — not measured).
- **Integration effort:** medium — a small Python HTTP service plus a provider class on our side.

### Birds specifically

- **iNaturalist vision / Merlin:** no public photo-ID API. iNat’s suggestion endpoint is partner-only and fee-based ([forum, staff](https://forum.inaturalist.org/t/hidden-computer-vision-api/41775)); Merlin has no developer API ([FAQ](https://support.ebird.org/en/support/solutions/articles/48000961587-merlin-bird-id-faqs)).
- **eBird API 2.0 (location prior):** free key; “recent nearby observations” up to 50 km / 30 days, plus regional species lists and taxonomy ([docs](https://documenter.getpostman.com/view/664302/S1ENwy59)). Terms (from search excerpts — the page blocked automated reading): non-commercial by default, eBird must be credited, commercial use needs written permission from ebird@cornell.edu ([terms](https://www.birds.cornell.edu/home/ebird-api-terms-of-use/)).
- **BirdNET (sound):** V2.4 covers 6,522 classes but the model is CC BY-NC-SA (non-commercial); V3.0 “developer preview” covers 11,000 species under CC BY-SA and is still changing ([birdnet](https://github.com/birdnet-team/birdnet), [V3.0-dev](https://github.com/birdnet-team/birdnet-V3.0-dev)). The official [BirdNET Live PWA](https://github.com/birdnet-team/real-time-pwa) runs fully in the browser with a location filter — a good model for adding sound ID without a server.
- **Other hosted bird APIs** (Nyckel, RapidAPI classifiers): small label sets (291–965 species) and no published accuracy. Not recommended.

### Fungi specifically — safety is the main work

Misidentifying mushrooms can kill. Regardless of provider:

- **Never display “edible.”** mushroom.id has edibility data for only ~13% of taxa with no published sourcing; Wikidata’s edibility property is crowd-edited. Use edibility/toxicity data only to *raise* warnings (e.g. a red banner if any top suggestion is poisonous or deadly).
- **Always warn about dangerous look-alikes.** mushroom.id’s look-alike data covers <5% of taxa, so keep our own list of dangerous genera (e.g. *Amanita, Galerina, Lepiota, Gyromitra, Cortinarius, Inocybe, Clitocybe*) and warn whenever a result is in or near one — ideally reviewed by a mycologist.
- **Prefer genus over species** when confidence is low, and ask for underside, stem-base and volva photos (the category registry already has these features).
- **Stronger fungi notice** pointing to local mycological societies and poison control.
- Open fungi models from the Danish Mycological Society/FungiTastic are CC-BY-NC (non-commercial) and Denmark-centric; Mushroom Observer offers training data but no ID service and discourages AI experimentation via its API.

### Mammals, reptiles, amphibians

- No specialized public API found. BioCLIP 2 with a local taxon filter is the practical route.
- **Google SpeciesNet** (Apache-2.0, 2,000+ labels, country filtering, falls back to higher ranks) is built for camera-trap images; worth trying only as a mammal cross-check ([repo](https://github.com/google/cameratrapai)).
- High-accuracy iNat21 models such as timm EVA02-L (92% top-1 on iNat21) are CC-BY-NC — fine for experiments, not for a public launch.

### General LLMs (Claude, GPT, Gemini)

On RealBirdID, GPT-5 scored 10.4% and Gemini 2.5 Pro 12.7% at species level, and models were poorly calibrated about when they couldn’t tell ([paper](https://arxiv.org/abs/2603.27033)). Acceptable uses: choosing the category for “Auto” (~$0.001/image), or describing visible features. Never the final species answer, and never a source of facts.

## Cost sketch (family scale, ~100 IDs/day per group)

- Kindwise insect.id / mushroom.id: €0.01–0.05 per ID → roughly €30–150/month per group at that volume; far less with casual use. First 100 IDs free.
- BioCLIP 2 on Modal: likely within the $30/month free compute at this volume (estimate).
- eBird, GBIF, iNaturalist occurrence data: free.

## Decisions and actions for the owner

1. **Kindwise:** create an account (admin.kindwise.com), get insect.id and mushroom.id keys, and decide on a credit budget (€50 minimum pack). Accept the photo-licence clause (§17.5); we’ll update the privacy page.
2. **Modal** (or Hugging Face): account with a card on file for the BioCLIP 2 service.
3. **eBird:** request an API key (https://ebird.org/api/keygen). Public/commercial use later needs Cornell’s written permission.
4. **Optional:** email iNaturalist (carrie@inaturalist.org) about paid partner access to their vision model — the best-in-class option if it’s ever granted.
5. **Before any public launch:** re-check licences (BirdNET V2.4 and eBird are non-commercial by default; avoid CC-BY-NC models).

## Could not verify

iNaturalist’s official API and computer-vision pages, the eBird terms page, the full Kindwise API reference and caching rules, and Svampeatlas terms returned errors to automated fetching; details for those come from staff forum posts, search excerpts or vendor summaries.
