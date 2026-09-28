# Decisions

Short records of the choices behind FieldLens v1 and why they were made.

## Stack: Vite + React + TypeScript, Vercel functions

Vite keeps the client small and fast; the API is a handful of Web-standard `Request → Response` handlers in `server/`, exposed through thin files in `api/` for Vercel. The same handlers run inside the Vite dev/preview server (`server/http/devMiddleware.ts`), so local development doesn’t need the Vercel CLI, and moving to Cloudflare Workers/Pages Functions only needs new entry points. Next.js wasn’t needed.

Version notes: TypeScript is pinned to 6.0 because `typescript-eslint` doesn’t support 7.x yet. Playwright no longer ships browsers for macOS 13, so local E2E can use an installed Chrome via `PLAYWRIGHT_CHANNEL=chrome`; CI uses Playwright’s bundled Chromium.

## Why Pl@ntNet for plants

It’s purpose-built for plants and returns ranked species with scores, supports up to five photos of the same plant with organ hints (leaf, flower, fruit, bark), returns GBIF and POWO identifiers we can join on, and has a free developer tier that suits a personal/family prototype. Its reference images carry author and license, so we show them only when both are present. Pl@ntNet accepts only JPEG/PNG, so the client always uploads JPEG.

## Why iNaturalist is displayed separately

The brief requires it, and it’s the right call: iNaturalist observations are community records of varying quality grade, and many are identified with the help of models similar to the one we use. Folding them into the confidence score would double-count evidence and hide where the number came from. The card shows local context (counts, recency, seasonality, licensed photos) with an explicit note that it doesn’t confirm the identification. It isn’t used in `finalConfidence`.

## Why GBIF for geographic evidence

GBIF aggregates museum, herbarium and survey data as well as citizen science (including research-grade iNaturalist records), with a public API that supports radius (`geoDistance`) queries and month facets in a single cheap call (`limit=0`). It also provides backbone taxonomy for normalizing names across providers, and IUCN categories. Counts are treated as bounded evidence, not proof: zero records applies only a small, capped penalty.

## Why exact GPS is not stored

Precise coordinates can reveal homes and routines, and ~1 km precision is enough for 5/25/100 km occurrence searches. Coordinates are rounded to 2 decimals on the device and again on the server (never trust the client), used only for the request, excluded from production logs, and removed before a result is saved to local history (which keeps only a ~10 km label). Cache keys use the rounded grid, so the cache doesn’t hold precise positions either. iNaturalist `place_guess` strings are reduced to town/region level and stripped of numbers (street numbers, postal codes).

## Why deterministic reranking first

It’s fast, free, reproducible, explainable in the UI, and unit-testable. The formula multiplies the visual score by a bounded adjustment, so local commonness can only discount a candidate — it can never raise a weak image match above its visual score. That directly enforces “never turn a weak image match into a high-confidence identification merely because a species is common nearby.” Weights live in `shared/config.ts`, and the reranker sits behind the `CandidateReranker` interface so alternatives can be swapped in.

## Why provider interfaces are taxonomy-neutral

`OrganismCandidate`, `IdentificationProvider`, `OccurrenceProvider`, `SpeciesInfoProvider` and `CommunityObservationProvider` know nothing about plants. Category-specific knowledge (features/organs, advice text, GBIF kingdom, iNaturalist iconic taxon, safety notice) lives in one registry (`shared/categories.ts`). Adding birds means writing a `BirdIdentificationProvider`, adding it to `server/providers/registry.ts`, and flipping `available: true` — the pipeline, reranker, UI and history don’t change. Pl@ntNet-specific details (organ mapping, response parsing) stay inside its adapter.

## Why “Jev” is deferred

The brief names a “Jev” reranker as a later experiment and asks that it not be a v1 dependency. v1 ships the deterministic reranker; the `CandidateReranker` interface leaves room for a `JevReranker` without coupling the app to it. Any model-based reranker must still respect the rule that facts and evidence come from sources, never from generation.

## Why a server-side proxy is required

The Pl@ntNet key must stay secret, so it can’t be in browser code. The server also validates uploads (MIME sniffing, sizes, dimensions), rounds coordinates, rate-limits, caches supporting queries, normalizes providers into one schema, and runs independent lookups in parallel with timeouts. A build-time canary check confirmed that neither the key nor provider URLs appear in `dist/`.

## Why GitHub Pages alone is insufficient

GitHub Pages serves static files only, so any key placed there is public, and there’s nowhere to run validation, rate limiting or response composition. Vercel serves the static PWA over HTTPS and runs the serverless API with environment secrets, deploying from GitHub.

## Kew / Plants of the World Online

POWO doesn’t publish a documented, supported public API, and Kew’s data terms require care with reuse. v1 doesn’t scrape it: Pl@ntNet supplies the POWO/IPNI identifier, and we link to the POWO page. A licensed or documented integration (e.g. for native ranges) is on the roadmap.

## Wikidata lookup via GBIF ID

Wikidata items are found through GBIF taxon ID (property P846) rather than name search, which avoids homonyms (the same name in different kingdoms). The item gives English common names and the exact English Wikipedia article title.

## Hash routing

Routes use `#/…`, so there are no server rewrites to configure and the service worker’s offline shell stays trivial.

## Rate limiting and caches in memory

Redis would cost money and add a dependency. v1 uses in-memory structures per serverless instance behind small interfaces (`Cache`, `RateLimiter`), which can be backed by a shared store later. The rate limit is skipped in mock mode, where there’s no quota to protect.

## Photos are never uploaded in full

The client crops to the box, caps the long edge at 1600 px and re-encodes as JPEG. This strips EXIF (including GPS), keeps requests under Vercel’s 4.5 MB body limit even with five photos, and still keeps enough detail for classification. The original stays in memory on the device and is discarded when the session ends.

## Native camera app instead of an in-page video preview

v1 first captured photos from a `getUserMedia` video stream. On phones that stream is often 640×480–1280×720, softer, and without the camera app's autofocus/HDR, which visibly lowered identification scores. “Take a Photo” now uses `<input type="file" capture="environment">`, which opens the phone’s real camera and returns a full-resolution photo (the brief’s preference for `getUserMedia` is outweighed by accuracy). Desktop browsers fall back to a file picker.

## Streamed progress for the analysis screen

The identify endpoint streams NDJSON when asked (`Accept: application/x-ndjson`): one line per pipeline stage as it actually starts/finishes, the visual provider’s first guesses, then the final result. The analysis screen’s checklist is driven only by these events — nothing is simulated with timers. Plain JSON responses remain supported.

## Genus-level answers

Visual models often split confidence across near-identical species (e.g. garden daisy cultivars). When the species is uncertain but same-genus candidates together reach 55%, the result says so plainly (“Probably a maple (Acer)”) with the exact species listed as uncertain. The combined score is a sum of candidate confidences and is labeled as such.

## Reference photo galleries

Galleries use the identification provider’s reference images (Pl@ntNet) plus iNaturalist taxon photos, which exist for every organism group. Only openly licensed photos are shown, each with author, license and a source link.

## Our own BioCLIP 2 service on Hugging Face

Non-plant identification uses BioCLIP 2 (MIT) running in a private Hugging Face Space on free ZeroGPU hardware under the owner's account, instead of paid APIs (Kindwise, ~€0.01–0.05 per ID) or card-backed hosting (Modal, Cloud Run). The Space loads pybioclip's precomputed embeddings for ~867k taxa, so each request only encodes the photo; it can restrict results to species/genera recorded near the user and return higher ranks (e.g. class) for Auto category detection. The FieldLens server calls it with a read-only `HF_TOKEN`, so usage counts against the owner's daily GPU quota and the Space isn't public. The public `imageomics/bioclip-2-demo` Space is a fallback. Scores are overconfident and must be tempered before mapping to confidence bands. Code lives in `hf-space/` and is deployed with `npm run space:deploy`.

## Edibility & safety section

Plants and fungi get sourced edibility/toxicity notes because people will ask about berries and mushrooms anyway, and a careful, cited answer is safer than none. Sources (see `docs/research/edibility-sources.md`): sentences quoted verbatim from the species' Wikipedia article (lead plus toxicity/uses/similar-species sections), Wikidata's edibility property for mushrooms, the TPPT toxic-plant database (bundled server-side, CC BY 4.0, "nontoxic" entries deliberately omitted), and a short curated list of high-risk taxa and dangerous look-alikes whose wording was checked against the cited pages. Rules: warnings are always shown, including for other likely candidates and known look-alikes; reported food uses appear only for high-confidence identifications and never for species reported toxic themselves; the words "safe to eat" never appear; mushrooms get extra warnings. The red "danger" level only comes from graded sources, so a quoted "toxic to horses" stays a caution, and the banner distinguishes a poisonous species from one with poisonous look-alikes.

## Fungi and birds on BioCLIP 2

Mushrooms (scope: kingdom Fungi) and birds (class Aves) use the same BioCLIP service as insects, marked experimental and capped at 90% confidence. Real-photo checks on 2026-09-27: fly agaric and black-capped chickadee/blue jay identified correctly; a chanterelle was right at genus level but only 19% at species level, which is why mushroom food uses stay hidden unless confidence is high and look-alike warnings are always shown.

## Broad picker groups and "Not sure"

People rarely know whether a newt is a reptile or an amphibian, or that a tick isn't an insect, so the picker offers Plant, Fungus, Bug, Bird, Animal and Not sure. Groups are resolved on the server: BioCLIP searches the union of the members' taxon scopes and each candidate gets its own specific category, which the result shows ("Amphibian"). "Not sure" first detects the category, then routes (plants to Pl@ntNet). Detection uses a score-weighted vote of the top 20 species rather than summing probabilities per class: on 11 real test photos the vote was right 11/11, while class sums misread a camouflaged wood frog as a fungus because very large classes accumulate many small probabilities. The same vote is used as a second opinion before declaring a photo off-target.

## Photo location for library uploads

A photo picked from the library may have been taken far away, so the crop screen asks where it was taken. The default is the photo's own GPS when present (read from EXIF on the device, rounded to ~1 km, never uploaded raw), "near here" for photos taken in the last three hours, otherwise "somewhere else". The photo's EXIF capture date also drives the seasonal check.

## Mammals: tracks & droppings, wildlife safety, facts (2026-09-27)

Evaluation on 44 real iNaturalist mammal photos (38 everyday, 6 trail-camera): BioCLIP 2 got 34/44 species right. Google SpeciesNet (Apache 2.0, free) was tested as a second opinion and got 16/44. It only matched BioCLIP on trail-camera shots, where BioCLIP was already 6/6, and it called several moose and bear photos "blank" or "human". It was not deployed. Half of BioCLIP's misses were tracks or droppings, and the rest were distant animals, which the crop box addresses.

**Tracks and droppings.** Picking "Tracks" or "Droppings" identifies a mammal from its sign; under "Not sure" and "Animal" these are the only options offered. The Space compares the photo with prompts like "a photo of footprints of red fox (Vulpes vulpes)", blended 50/50 with the ordinary taxonomic match. Candidates are about 200 mammal species with research-grade iNaturalist records within 150 km, falling back to the most-recorded mammals worldwide.

On 75 iNaturalist track and scat photos, ranked against 150 regional species, this took species-level accuracy from 13/38 to 19/38 for tracks and from 13/37 to 22/37 for scat. Because that is still only about half right, sign scores are capped at 50%, so results always read as possible matches. Guidance asks for a straight-down photo with something for scale.

**Wildlife safety.** A curated list (`server/safety/wildlife.ts`) of warnings checked against CDC, US National Park Service, Humane World for Animals and Wikipedia pages. It covers rabies (bats, raccoons, skunks, foxes), bears, moose, bison, elk, wolves and cougars, coyotes, porcupines and dogs, and deer ticks. It also covers droppings hygiene: raccoon roundworm, and hantavirus from mouse and rat droppings. Notes for other likely candidates appear when the identification is uncertain. Nothing is ever described as harmless.

**Facts.** Average adult weight, diet percentages, day or night activity and foraging stratum come from EltonTraits 1.0 (Wilman et al. 2014, CC0), bundled by `scripts/build-mammal-traits.mjs`. The script also indexes current GBIF names for species renamed since MSW3. Wikidata was too patchy: no mass for moose, and inconsistent units. As with other species facts, they are hidden when the identification is low-confidence.

## Home as a field instrument; leaner results (2026-09-28)

The home screen's hero is a viewfinder: a dark panel with the same reticle and grid as the crop and analysis screens. The whole panel is the camera button, and a small monospace readout shows readiness and the approximate position, rounded on the device. Research pointed to camera-first nature apps (Seek) and to function-first design lasting longer than trends, so the serif wordmark, paper and moss palette stay. The only "futuristic" cues are the instrument ones: reticle, grid, readout and a slow scan sweep, all disabled with reduced motion. The group icons became a quiet "Recognises" list.

Results lost their explanatory subtext: the confidence footnote, per-candidate "image match · location" lines, the globe caption, the iNaturalist disclaimer, the photo-library hint and the Sources list. The geographic card is hidden when no location was used. Inline credits that licences require stay: photo authors, the Wikipedia quote and safety sources. Every source is still listed on the privacy page.
