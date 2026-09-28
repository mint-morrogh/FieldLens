# TODO

Near-term, actionable work. Longer-term ideas live in [ROADMAP.md](ROADMAP.md); provider research in [docs/research/identification-providers.md](docs/research/identification-providers.md).

## In progress

Live: private Space `mintmundane/fieldlens-bioclip` (ZeroGPU), source in `hf-space/`, redeploy with `npm run space:deploy`. Verified 2026-09-27: monarch, blue jay and fly agaric correct in 1–2 s per call.

- [x] **Run our own BioCLIP 2 on Hugging Face** (free ZeroGPU Space) as the identification service for non-plant groups.
  - [x] Create the Space under the owner's account (Gradio + ZeroGPU; account must be verified and 30+ days old).
  - [x] Endpoint: photo(s) + optional species/genus list → ranked species with scores (uses precomputed embeddings for ~867k taxa, so no per-call text encoding); also rank-level output (e.g. class) for Auto detection.
  - ~~Keep the public `imageomics/bioclip-2-demo` Space as a fallback.~~ Dropped (owner, 2026-09-28): no fallback to lower-accuracy services. When a quota is hit, fail and say so.
  - [x] Store a read-only `HF_TOKEN` in Vercel (server-side only) so calls use the owner's daily GPU quota (5 min/day on a free account).
  - [x] Temper BioCLIP 2's scores: weighted by how much the photo looks like the chosen group, capped at 90% while experimental. Revisit with real-photo measurements.

## Next

- [x] **Edibility & safety section** (plants and fungi), researched sources only:
  - [x] Research free, reusable sources — see [docs/research/edibility-sources.md](docs/research/edibility-sources.md) (Wikipedia sections + Wikidata P789 + bundled TPPT; Canadian/FDA databases are gone).
  - [x] Quote sourced statements with links; never "safe to eat"; include plant part and preparation when stated.
  - [x] Edible notes only on high-confidence results; toxic warnings and known toxic look-alikes shown at any confidence.
  - [x] Fungi: stricter — prominent expert-confirmation warning on any edible statement; dangerous look-alike genera always flagged.
  - [x] Permanent footer: "Never eat a wild plant or mushroom based on an app — confirm with a local expert."

- [x] Insects & spiders via `BioclipIdentificationProvider` (experimental label, confidence capped at 90%, “does this look like an insect?” check with a one-tap category switch, iNaturalist common names). Geographic support comes from the existing GBIF reranker.
- [x] Fungi via BioCLIP (experimental) with the safety package: top-of-result mushroom warning, dangerous genera and look-alikes always checked (even when confident), food uses never shown for species reported toxic, stem-base photo prompt.
- [x] Birds via BioCLIP (experimental).
- [x] Mammals, reptiles, amphibians and fish (BioCLIP scopes; reptiles span Squamata/Testudines/Crocodylia/Sphenodontia, most fish have no class in the Tree of Life labels).
- [x] Photo-first home: automatic by default; the optional “What is it?” choice (Plant, Fungus, Bug, Bird, Mammal, Reptile & amphibian, Fish) lives on the crop screen; the result shows the specific category. Detection failures fall back to plants.
- [x] Home polish: hero, “works out what it is” icon row, location pill, swipeable recent cards with delete + undo.
- [x] “Not sure”: detect the category by top-20 species vote (beat class sums on real photos), then route (plants → Pl@ntNet).
- [x] Tap your own photo for a full-screen view (original in-session; ≤2048 px copy saved in History).
- [x] “Hear pronunciation” via on-device speech.
- [x] Location unblock steps tailored to device/browser.
- [x] “Where was this photo taken?” for library photos, with on-device EXIF GPS/date reading.
- [x] Spinning globe of worldwide GBIF records per country.
- [x] Balanced headline wrapping; no inline “Likely” prefix.
- [x] Mammals (2026-09-27): tracks & droppings mode, sourced wildlife safety notes, EltonTraits size/diet/activity facts. SpeciesNet tested as a second opinion and rejected (16/44 vs BioCLIP's 34/44 on real photos).
- [ ] Bird facts from EltonTraits' bird table (same CC0 dataset, `BirdFuncDat.txt`).
- [ ] Grow the wildlife safety list (`server/safety/wildlife.ts`) beyond North America.
- [ ] Optional: eBird nearby observations as an extra bird prior (needs an eBird key).
- [x] "Auto" category detection (“Not sure”).
- [x] Real-phone testing by the owner (2026-09-27): everything right except some mushrooms. Experimental tag removed; confidence cap kept only for mushrooms.

## Identification context from the phone

Extra signals that nudge ranking. Like the range maps, each is a capped adjustment, never a hard rule.

- [ ] **Ask for the deciding angle.** When the top candidates are split on a feature that a specific view would settle, prompt for that view in live mode and photo mode: "Show the underside of the cap", "Photograph the leaf underside", "Get the stem base". In live mode it appears as a hint over the camera and the next frames are added to the same identification; in photo mode it's an "Add a photo" prompt. Build on the existing follow-up questions and the stem-base prompt. Only ask when it would actually help.
- [ ] **Local time of day.** Use the capture time in the local time zone of where the photo was taken: EXIF date and GPS for library photos, the phone clock for camera photos. Favour nocturnal species at night (moths, owls, bats) and diurnal ones by day (butterflies, songbirds), using EltonTraits activity data where it exists. Treat it as a weak signal: porch lights, dawn and dusk, and disturbed animals all break the pattern.
- [ ] **Elevation.** Look up ground elevation from latitude and longitude with a terrain dataset instead of trusting the phone's GPS altitude. Use it where it matters (alpine and montane plants, butterflies, some birds) and ignore it for groups where elevation says little. Needs sourced elevation ranges per taxon, or elevations taken from GBIF records.
- [ ] **Camera tilt as a hint.** Read the phone's tilt when the photo is taken (on iOS this needs a permission tap, which can be added to the camera permission step). Pointing up suggests canopy or sky (birds in trees, tree flowers); pointing down suggests the ground (fungi, low plants, insects). Keep it soft: people lie down and tilt up to shoot a mushroom, so tilt should only break ties between close candidates, and only for the groups where it applies. Never use it to rule out a species.

## Field use and app polish

- [ ] **Offline queue.** No signal on a trail? Save the photo and approximate location on the device, then identify automatically once back online, with a notification when results are ready.
- [ ] **Battery- and data-light live mode.** Lower the live detector's frame rate when the phone is low on battery (Battery Status API where available) or getting warm, and add a data-saver setting (smaller uploads, fewer live frames).
- [ ] **Settings page, expanded.** The first version holds today's identification usage. Add the "Name it first" toggle, units (metric/imperial), data saver, clear data, and the default camera mode (photo or live).
- [ ] **Install prompt.** A gentle "Add FieldLens to your home screen" nudge after the second use, so it opens full-screen like a native app (beforeinstallprompt on Android/Chrome; short instructions on iOS Safari).
- [ ] **Seasonality, stronger and visible.** Out-of-season matches (a plant flowering in January, a summer migrant in winter) should count for more in ranking and show on the result. Applies to plants, trees, birds, insects and more. Build on the eBird/range work once it's committed.

## Gamification: collection depth

**Guidelines (owner, 2026-09-28):** made for adults, including adults getting into biology. Visual celebration is fine, such as stamps and short rank-up animations, but **no sounds**. Everything stays on the device for now; a small backend comes later.

Builds on the Field Journal and naturalist rank (done 2026-09-28). No rarity scores: record counts reflect how often people log a species, not how rare it is.

- [ ] **Field-guide pages that fill in.** Tapping a species card opens a journal page that grows as you log more: first sighting, then "seen in 3 seasons", "seen in 2 places", "photographed the flower, leaf and bark". Completion is about knowing the species, not just ticking it off.
- [ ] **Life stages and parts.** The same species counts extra for new parts or stages: monarch caterpillar vs butterfly, maple in flower vs fall colour, a mushroom cap vs its gills. Uses the part already recorded with each photo.
- [ ] **Family trees.** Group journal cards by genus or family ("Maples (Acer) · 3"). Finding 5 species in a genus or family earns a stamp, e.g. "Maple Family: 5 of 12 recorded near you". The "recorded near you" count comes from real GBIF data.

## Gamification: journeys and places

- [ ] **Explored areas on the globe.** Each ~10 km area where you've found something lights up on the journal globe. Milestones like "5 areas explored" and "a new province".
- [ ] **Home patch.** Set an area (home, cottage, a favourite trail) and track "species found at your patch" over time, to see seasonal change on places you return to.
- [ ] **Seasonal wheel.** A 12-month ring per group that fills as you log finds in each month. "Fall fungi" and "spring flowers" become visual goals without time-limited events.

## Gamification: skill

- [ ] **"Sharp eye" bonus.** Extra points when a follow-up answer or an added photo turns an uncertain identification into a confident one. Rewards good habits: photographing the right part, noting size and time.
- [ ] **Name it first** (optional setting, **off by default**; aimed at adults getting into biology, not just kids). Before the result appears, you can guess the group or the name. A correct guess earns a "Called it" stamp; fun with kids. Needs a settings toggle.

## Gamification: streaks and gentle goals

- [ ] **Weekly field goals.** Three small goals each week, generated from your own journal: "Find a new species", "Log something in a group you haven't tried", "Photograph bark". The streak counts weeks, not days, so it never feels like a chore.
- [ ] **Daily "What's out now".** One species in season near you this month (from GBIF month data) as a soft challenge: "Goldenrod is at its peak near you. Can you find it?"

## Gamification: rewards and polish

- [ ] **Stamps and badges**, drawn as field-guide-style ink stamps on journal pages:
  - **First Light:** first find of the day before 8 am.
  - **Night Walker:** a nocturnal animal (EltonTraits activity data).
  - **Tracker:** an identification from tracks or droppings.
  - **Five Kingdoms:** one find from each group. The journal has seven groups; rename it or pick five.
  - **Canopy:** 10 trees. Needs trees told apart from other plants: save when "Tree" was chosen, or use a sourced growth-form trait.
  - **Mycologist:** 10 fungi.
- [ ] **Rank-up moments.** A short full-screen animation when you rank up, plus a new badge colour or journal cover per rank. Respects reduced motion.
- [ ] **Specimen card sharing.** A shareable image in the app's style: your photo, the name, "Field Naturalist · 42 species", the date. Web Share API, falling back to a download. No accounts needed.

## Later

- [ ] Grow the curated high-risk list (`server/safety/highRisk.ts`), ideally reviewed by a local botanist/mycologist.
- [ ] Show look-alike reference photos next to look-alike warnings.

- [ ] Delete the Hugging Face write token (`HF_DEPLOY_TOKEN` in `.env.local`, “fieldlens-setup” on huggingface.co) when not actively changing `hf-space/`.
- [ ] Bird sound ID with BirdNET running in the browser (check licence before any public launch).
- [ ] Fix the TypeScript warnings in Vercel's build log.
- [ ] Optional: ask iNaturalist about paid partner access to their vision model.

## Gamification: looking back

- [ ] **Year in review.** A private year-end summary built on the device from the journal: species count, busiest month, first-ever fungi (and other firsts), favourite place, new groups explored. Quiet and visual, no sounds; something nice to look back on.

## Later version: social and citizen science

These need accounts or a small backend, so they're planned for a later version of the app.

- [ ] **Family or group journal.** Share a journal code with family or a class to see a combined species count and each other's finds. Needs a small backend (and a privacy review: no exact locations shared).
- [ ] **Contribute to science.** Link an iNaturalist account and post good finds as real observations, with a badge when one reaches "research grade". Needs iNaturalist OAuth account linking.
