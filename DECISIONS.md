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

## People, the analysis screen and photo parts (2026-09-28)

**People.** BioCLIP 2 is trained on the Tree of Life and can't recognise people: on public-domain portraits, _Homo sapiens_ ranked 48,000th or lower, and a portrait of Barack Obama came out as the flatworm _Obama marmorata_. BioCLIP's own text encoder has lost everyday concepts like "person", so the Space runs a small general CLIP model (MobileCLIP-S1, Apple) on every photo. In testing, the person share was 0.24–0.91 for portraits and at most 0.05 for 166 photos of plants, fungi, animals, tracks and droppings, including ones with a hand for scale. At ≥ 0.15 the app answers "That's a person!" instead of guessing a species.

**Analysis screen.** The photo panel shows what a vision classifier does, driven by the real stages:

- While the image model runs, the photo turns high-contrast grayscale, a patch grid lights up (vision transformers read images as patches) and a loupe magnifies regions.
- Colour returns while names and local records are checked.
- The progress bar is the share of finished stages.

No invented numbers are shown.

**Photo parts.** The crop sheet only asks "Which part?" once a type is chosen, and the row slides open. Bug gained From above, Side, Head, Wings and Web; Fish gained Whole fish, Head, Fins & tail and Markings. Tracks and droppings are offered under Mammal only.

**Home.** Dim CC0 iNaturalist photos of living things cross-fade behind the camera button. The location readout moved to the top-left, and the Recognises list was removed.

## Live identify, follow-up questions, the world map (2026-09-28)

**Live identify.**

- A second way in, next to Take a photo. Google's MediaPipe object detector (EfficientDet-Lite0, Apache 2.0) runs on the phone, loaded on first use from jsDelivr and Google's model storage.
- It boxes animals, potted plants and people in the camera feed; everything else is framed by a centre box, because the detector's COCO classes don't include most wild plants, fungi or insects.
- When the view holds still for about 0.9 s, that frame is cropped to the box and sent through the normal identification. The preview and result are drawn on the box.
- A high-confidence result locks on and opens the results page, saved to history like a photo. Otherwise it keeps looking, with "See best match".
- Video never leaves the phone. To protect the free Pl@ntNet and Hugging Face quotas, a live session sends at most 4 frames, 2.5 s apart. People are recognised on the device and never sent.

**Follow-up questions.**

- Asked only when the result is uncertain and the top match has a close runner-up (at least 35% of its score) that an answer would clearly separate from it.
- Answers come from sourced traits only: EltonTraits body mass (size) and activity (time of day), for mammals and birds. Each question has "Not sure".
- An answer down-weights contradicting matches (×0.3) and never boosts any.
- If the top match changes, the facts, map and photos for the old top match are hidden.
- Nothing is asked from unsourced "knowledge", such as smell.

**World map.** The data was there for every group, but the map was hidden for low-confidence results, which is most fungi and many animals. It's now shown on every result; for uncertain ones the heading names the species it's about.

**Analysis visual** now shows BioCLIP 2's real pipeline: resize to 224 × 224, a 16 × 16 grid of 14 px patches read in order as tokens, ViT-L/14 with 24 layers, a 768-d embedding, and cosine similarity against 867,455 taxa. Plants (Pl@ntNet) get the same steps without numbers.

**Undo delete** now hides the card and deletes after the 6-second undo window, because re-saving a deleted record fails on iOS Safari.

## Field Journal and naturalist rank (2026-09-28)

History became the **Field Journal**, computed on the device from local history with nothing new stored:

- one card per species, with sighting count, first-seen date, and an "Unconfirmed" tag for low-confidence finds;
- filters for the seven picker groups;
- a globe with a pin per ~11 km area where finds were made, parsed from the coarse location label history already kept, so older finds get pins too;
- a collapsible list of all entries for deleting.

**Rank:** 1 point per species identified with at least medium confidence, plus 5 for each group explored. Wanderer 0, Observer 5, Tracker 15, Field Naturalist 30, Naturalist 60, Master Naturalist 100, Field Scholar 175. It counts distinct species, not photos, so repeat photos can't farm points.

**Rarity** was considered and left out. iNaturalist and GBIF record counts measure how often people bother to log something, not how rare it is: a common spruce can have almost no local records.

**Live identify, revised.** Scanning is fully automatic: there's no button. While a frame is being identified, a glass tag shows what kind of organism it looks like (the auto-detect stage now streams the detected group), then the first name guess. A likely or very likely match appears in a frosted card over the camera with the name, up to three reference photos, **Clear** (keep scanning) and **Details** (full results page). Up to 8 frames per session.

**Tree** is a picker choice alongside Plant and Fungus. It is still identified by Pl@ntNet, whose plant model covers trees, but offers tree parts: leaves or needles, bark, cones/nuts/fruit, flowers and catkins, twigs and buds, and whole tree. Parts Pl@ntNet has no organ for are sent as "auto".

## More free evidence: flowering, eBird, ranges, bill shape (2026-09-28)

**Pl@ntNet regional floras were tested and not adopted.** On 32 iNaturalist photos from the northeastern US, `k-northeastern-u-s-a` returned exactly the same species and scores as `all` for all 16 wild plants: the regional project filters the world model's list, it doesn't re-score it. It dropped garden and house plants: Monstera, Hydrangea and snake plant disappeared, and garden plants in the top 3 fell from 11/16 to 7/16. Range evidence is handled softly by the reranker instead (below).

**Flowering season.** For a plant photo tagged as a flower, the seasonal check uses iNaturalist research-grade records annotated "Flowering" within 150 km, instead of all records. For example, bloodroot near upstate New York has 919 flowering records in April and none in September. With fewer than 12 flowering records it falls back to all records, so garden plants with no local flowering data aren't penalised. It runs for the top 4 matches only, to stay within iNaturalist's rate limits.

**eBird recent sightings (birds).** With `EBIRD_API_KEY` set, one call lists the species reported within 50 km in the last 30 days (free for non-commercial use). Migrants come and go within weeks, which GBIF month counts can't show. For birds, "reported recently" replaces the month check and weighs a little more (visual 0.8, geo 0.1, season 0.1), so a bird with no recent reports loses at most 10%. Areas with fewer than 30 species reported in the month are treated as "no data", because there absence means nothing. Names are matched on scientific or English name, since eBird uses Clements taxonomy.

**Range maps.** iNaturalist's Open Range Map Dataset (CC BY 4.0, rebuilt monthly) models where each of about 123,000 taxa is expected, as H3 resolution-4 cells (~26 km). There's no public API that answers "is it expected here?" (`/computervision` needs a login, `/taxa/nearby` returns observation counts), so `scripts/build-range-shards.py` turns the geopackages into one small binary file per resolution-2 parent cell. The files are stored in a private Hugging Face dataset (`RANGES_DATASET`, read with `HF_TOKEN`). A request fetches only the shard(s) for its ~26 km cell and neighbours, cached per instance for a day. Candidates get a capped multiplier: in range 1; within one cell 0.92 (plants 0.97); outside 0.75 (plants 0.9, because gardens and houseplants grow far outside native ranges). Species without a map aren't touched. This can only lower a score. The maps sometimes include places where a species is absent (a red fox "in range" in Auckland), which just means no penalty. They can also miss poorly recorded regions, which is why the penalty is capped. Using the ranges to restrict BioCLIP's search was considered and rejected, because a gap in a map would make the right species impossible to find.

The index was built from version 2.34 (740 MB in 5,882 shards; median 67 KB, largest 759 KB). A lookup costs about 0.3–0.9 s the first time for an area and about 25 ms once the shard is cached. Version 2.34 (also 2.29 and 2.33) has an export defect: when a range's main polygon crosses the antimeridian, it's sometimes dropped, so red fox has no Europe or North America and Eurasian red squirrel no Europe. The build repairs such ranges from 2.32 when the newer one has less than half the cells (1,247 repaired, listed in `repaired.json`). Check this again at each monthly rebuild.

**Bill shape question (birds).** AVONET (Tobias et al. 2022, CC BY 4.0) measurements give each bird's bill thickness (depth ÷ length) and relative length (length ÷ wing). "What was its bill like?" offers:

- short and thick (thickness ≥ 0.42);
- thin or pointed;
- long (length ≥ 0.26 × wing);
- hooked (raptors, owls, parrots);
- flat (ducks, geese).

The bands overlap near their edges so in-between birds fit both. AVONET's "lifestyle" and "habitat" fields were rejected for questions because they don't match what people see: gulls, herons and blue jays are all "terrestrial".

## Quotas, Settings, and live voting (2026-09-28)

**No fallbacks.** When a free quota runs out, identification fails with a clear message, and we never switch to a lower-accuracy service (owner's decision). Pl@ntNet's 429 says "today's free plant identifications … reset at midnight UTC". ZeroGPU's quota error arrives as a Gradio error event; it's detected by its text and reported with the time until reset when the message includes it.

**Settings → Today's identification usage** (`GET /api/usage`):

- **Pl@ntNet:** reads the exact count from `/v2/quota/daily`, which doesn't use up an identification, cached for 60 s.
- **Hugging Face:** doesn't report ZeroGPU usage, so we show the allowance and, once a request has hit the limit, "Limit reached".

**Live multi-frame voting.** A card only appears once two frames in a row agree on the species. The follow-up frame is taken after 0.5 s instead of 2.5 s, a big camera move resets the vote, and the per-session cap rose from 8 to 12 frames to allow for it.

**Vercel TypeScript errors.** Vercel type-checks each function with the tsconfig nearest to it. The root tsconfig only lists references, so the functions were checked without Node types or a modern `lib`. `api/tsconfig.json` now extends `tsconfig.server.json`. Node is pinned to `22.x` (it was `>=20`, which Vercel warned would auto-upgrade), and the `memory` setting Vercel ignores was removed.

## Calls: identifying birds by sound (2026-09-28)

**Bird calls** is a third way in on the home screen, next to Live identify and Choose photo.

**Recording.** The phone records up to 15 seconds from the microphone, with echo cancellation, noise suppression and auto-gain turned off, because phone voice processing strips birdsong. A live spectrogram (0–11 kHz) shows what's being heard. The clip is decoded on the device and sent once as mono 16-bit WAV at 48 kHz: about 1 MB for 10 s, well under Vercel's limit. This avoids handling each browser's format (AAC on iOS, Opus elsewhere) on the server, and it sends no container metadata. The server checks the WAV header and length (3–15 s). The recording isn't stored anywhere: history keeps the spectrogram image as that find's "photo".

**Model.** Identification uses BirdNET v2.4 (K. Lisa Yang Center for Conservation Bioacoustics), running on the same Hugging Face Space as BioCLIP.

- It runs on CPU, so it doesn't use the daily ZeroGPU quota: about 0.3 s for 10 s of audio.
- The TFLite models run directly with `ai-edge-litert`. The `birdnet` package starts worker processes per call, which would reload BioCLIP each time.
- The location model drops species not expected at that place and week.
- Species are ranked by their mean score over overlapping 3 s windows, which favours the bird singing throughout. Confidence follows the best window, is capped at 95%, and never rises down the list.
- Noise classes ("Human vocal", "Dog", "Engine"…) are never matched to species. When one is louder than any bird, the app says so.
- **Results:** on 40 real recordings (iNaturalist, mostly phone clips), top-1 was 36/40 and top-3 37/40 with location. Two live checks through the deployed Space got Northern Cardinal (0.82) and Blue Jay (0.95).
- **Licence:** the model weights are **CC BY-NC-SA 4.0**. That's fine for this non-commercial project, but they'd need replacing or a licence for any commercial use.

After identification, calls go through the same pipeline as photos (taxonomy, GBIF, eBird, ranges, facts, bill-shape question), with "sound-model" wording and no photo tips.

**Space dependency pin.** `torch<2.14`, because ZeroGPU supports torch up to 2.13 and the unpinned requirement would have pulled 2.14 on the next rebuild.

## Fishial (fish): evaluated, not deployed (2026-09-28)

Fishial's open classifier (v0.10.2, 866 fish classes, DinoV2, TorchScript) was tested as a second opinion next to BioCLIP on 40 iNaturalist fish photos: 32 of species Fishial knows, 8 of species it doesn't.

- Used as a confirm-only tie-breaker, it raised top-1 on known species from 20/32 to 24/32 and changed nothing on unknown ones. It fixed carp, clownfish, guppy and striped bass, and broke none.
- The rule: raise a BioCLIP candidate only when Fishial's top pick matches it with similarity ≥ 0.6. Never lower a score, and never use Fishial's own percentages.
- Those percentages are unusable: it gave 0.999+ to wrong answers, and it names a close relative for fish it doesn't know.

It isn't deployed for now, because:

- the thresholds were tuned on the same small set;
- the weights ship without a licence file (only the code is clearly MIT);
- the recommended detector depends on AGPL-licensed `ultralytics`;
- it adds about 1 GB of memory to the Space.

Revisit it if Fishial confirms the weights' licence, and after checking the thresholds on a fresh set of 100+ photos.

## Live identify: tap, sharper frames, possible matches (2026-09-28)

A bouquet in live mode never produced a result, although a photo of it did. Four causes:

- **Small crops.** The camera was asked for about 1280×720, and the centre 60% square was sent: about 430 px, against up to 1600 px from the native camera in photo mode.
- **No flower class.** The COCO detector has "vase" and "potted plant" but no "flower", so a bouquet got a blind centre box.
- **Uncertain results were discarded.** Only medium or high results that two frames agreed on were shown. A mixed bouquet is uncertain by nature.
- **No feedback.** Nothing said why it was waiting.

Changes:

- **Tap to identify.** Tapping the view picks the detector box under the finger, or a square around the tap (45% of the shorter side), and identifies at once: no stillness wait, no second frame. Where the browser supports ImageCapture (Chrome on Android), a tap takes a full-resolution still and crops it; elsewhere it falls back to the video frame.
- **Sharper frames.** 1920×1080 video, and crops up to 1600 px, the same as photo mode.
- **Possible matches.** Low-confidence results show as an amber "Possible … ?" card: from a tap straight away, and when scanning automatically, once two frames agree. The best match so far is always offered as "See best match".
- **Detector hints.** A vase counts as flowers and a potted plant as a plant; both go straight to Pl@ntNet. Birds go to birds; cats, dogs and other COCO animals go to mammals. This skips server-side category detection, which is faster and saves the GPU quota. The tag on the box shows the group while it identifies ("Plant · identifying", then the name); under automatic detection it updates to what the server found, e.g. "Fungus".
- **Tips.**
  - "Several things in view: tap the one you mean" (more than one subject, or a bouquet).
  - "Move closer, or tap it" (subject under 4% of the frame).
  - "Not sure yet. Move closer, or tap one flower, leaf or animal" (after an uncertain result).
- The scan limit rose from 12 to 15 frames per session, taps included.

## Sea life, seaweed, moss and a sectioned "What is it?" sheet (2026-10-02)

Crabs photographed at the beach got no answer. BioCLIP 2 already knows them; FieldLens just had no category for them, so they were filed as "other". Groups added, each checked against BioCLIP's own label list (number of species in brackets):

- crustaceans (14k, horseshoe crabs included)
- molluscs (58k, octopus and squid included)
- sea stars and urchins (4.9k)
- jellyfish, anemones and corals (6.8k)
- sponges and sea squirts
- worms
- seaweed (brown, red and green)
- mosses and liverworts

Microscopic groups (plankton, copepods, diatoms) are left out: you can't photograph them with a phone, and BioCLIP scores 1–6% on them.

**Routing.**

- Red and green seaweeds are Plantae in the labels, so they are checked before the "plants go to Pl@ntNet" rule.
- Sea squirts are chordates with a class of their own, so they no longer fall into fish.
- Mosses go to BioCLIP, not Pl@ntNet.

**Picks named for people, not biologists.** The chip row became one "What is it?" button that opens a sheet with search, jump links and four sections: Plants & fungi, Bugs & creepy-crawlies, Animals, Beach & water. Each section except plants can be picked whole ("Any bug", "Anything from the beach"), so a rough idea still narrows the search. Narrower picks, all on BioCLIP:

- insects: butterfly & moth, beetle, bee/wasp/ant, fly, dragonfly, grasshopper & cricket, stink bug & cicada, centipede & roly-poly
- reptiles and amphibians: snake, lizard & alligator, turtle, frog & toad, salamander & newt
- molluscs: snail & slug, clam & mussel, octopus & squid
- lichen

Reptiles have no order in BioCLIP's labels, so snakes and lizards are split by family.

**Look-alikes count in both places.** Each pick's scope takes in what people mistake for it:

- legless lizards under Snake
- newts under Lizard and skinks under Salamander
- roly-polies with the centipedes and with the crabs
- earthworms and garden slugs under Any bug

The result still names the true group: a newt picked as a lizard says "Amphibian". Search knows everyday words ("roly-poly", "starfish", "kelp").

**Wrong picks.** When a photo doesn't look like the pick, the top-20 species vote decides as before. It now asks whether the pick's own taxa outweigh every other group, not whether the top group is a member. If they don't, a narrow pick widens to its section (a butterfly picked as "Beetle" is searched as "Any bug"), and a broad pick suggests the right group. The Space accepts a list of taxon filters (any of), which these mixed scopes need; one filter works as before.

**Safety.** All animal groups now get wildlife notes. New sourced notes (healthdirect, MedlinePlus, DAN, NOAA, NPS, NHS inform, CFIA; `server/safety/marine.ts`) cover:

- box jellyfish, Irukandji, man o' war, sea nettles, lion's mane and fire coral
- blue-ringed octopus and cone snails
- crown-of-thorns starfish and sea urchins
- stingrays, stonefish, lionfish, scorpionfish and weever fish
- sea snakes and fireworms
- paralytic shellfish poisoning, for mussels, clams, oysters and scallops

Crustaceans and molluscs carry a standing "never eat wild shellfish based on an app" notice.
