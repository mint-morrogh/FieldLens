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
- [x] Bird facts from EltonTraits' bird table (same CC0 dataset, `BirdFuncDat.txt`): weight, diet, activity, where it feeds.
- [x] Grow the wildlife safety list (`server/safety/wildlife.ts`) beyond North America (Europe/UK, Australia, Africa, South Asia, South America; now also shown for reptiles and amphibians).
  - [x] Replace the Wikipedia-sourced wildlife notes (about 14, mostly African/Asian animals and snakes) with agency sources where possible.
- [x] Optional: eBird nearby observations as an extra bird prior (needs an eBird key).
- [x] "Auto" category detection (“Not sure”).
- [x] Real-phone testing by the owner (2026-09-27): everything right except some mushrooms. Experimental tag removed; confidence cap kept only for mushrooms.

## Identification context from the phone

Extra signals that nudge ranking. Like the range maps, each is a capped adjustment, never a hard rule.

- [x] **Ask for the deciding angle.** When the top candidates are split on a feature that a specific view would settle, prompt for that view in live mode and photo mode: "Show the underside of the cap", "Photograph the leaf underside", "Get the stem base". In live mode it appears as a hint over the camera and the next frames are added to the same identification; in photo mode it's an "Add a photo" prompt. Build on the existing follow-up questions and the stem-base prompt. Only ask when it would actually help.
  - [x] Done 2026-09-28: `decidingView` on the identify response (`server/facts/decidingView.ts`), only for medium/low results with a close runner-up and a part not yet photographed. Fungi: the stem base when an Amanita and a non-Amanita are close; the underside when their families differ between gills, pores, teeth and ridges. Birds: the head and bill when AVONET bill shapes differ. Plants: a flower (or fruit) when the close matches share a genus and neither was photographed. Photo mode: a "The deciding angle" card with "Add a photo" (feature preselected). Live mode: "Show it to the camera" on the match card, then a hint over the camera; the next frame is sent together with the earlier one(s) as one identification.
  - [ ] No sourced plant trait data for leaf-underside prompts (hairs, colour); plants only get the flower/fruit prompt within a genus. Fungi underside types are by family, so candidates without a family get no prompt.
- [x] **Local time of day.** Use the capture time in the local time zone of where the photo was taken: EXIF date and GPS for library photos, the phone clock for camera photos. Favour nocturnal species at night (moths, owls, bats) and diurnal ones by day (butterflies, songbirds), using EltonTraits activity data where it exists. Treat it as a weak signal: porch lights, dawn and dusk, and disturbed animals all break the pattern.
  - [x] Done 2026-09-28: sun altitude at the capture place (solar time from longitude for library photos), dawn/dusk neutral, capped at 5% (half that for nocturnal species by day). Data: EltonTraits for birds and mammals, butterfly families for insects; moths have no data, so no effect.
- [x] **Elevation.** Look up ground elevation from latitude and longitude with a terrain dataset instead of trusting the phone's GPS altitude. Use it where it matters (alpine and montane plants, butterflies, some birds) and ignore it for groups where elevation says little. Needs sourced elevation ranges per taxon, or elevations taken from GBIF records.
  - [x] Done 2026-09-28: Open-Meteo elevation for the ~11 km cell (3 × 3 samples), compared with nearby GBIF records that carry an elevation; plants, insects and birds only, capped at 8%.
  - [ ] Most iNaturalist and eBird records in GBIF have no elevation, so the nudge often has too few records to apply. Sourced per-taxon ranges (e.g. floras) would cover more species.
- [x] **Camera tilt as a hint.** Read the phone's tilt when the photo is taken (on iOS this needs a permission tap, which can be added to the camera permission step). Pointing up suggests canopy or sky (birds in trees, tree flowers); pointing down suggests the ground (fungi, low plants, insects). Keep it soft: people lie down and tilt up to shoot a mushroom, so tilt should only break ties between close candidates, and only for the groups where it applies. Never use it to rule out a species.
  - [x] Done 2026-09-28: tie-breaker only (within 3%), from EltonTraits foraging strata for birds and mammals, plus fungi. Live mode reads tilt at capture; photo mode reads it as the photo returns from the native camera. iOS asks for motion access on the first camera photo's Identify tap (the native camera has no in-app permission step).
  - [ ] No sourced growth-height data for plants or insects yet, so tilt has no effect on them.

## Field use and app polish

- [x] **Offline queue.** No signal on a trail? Save the photo and approximate location on the device, then identify automatically once back online, with a notification when results are ready.
  - [x] Saved automatically when offline (offered after a network error): cropped photos, an EXIF-free display copy, capture time/hour/tilt and the request's ~1 km position, in a new IndexedDB `queue` store (DB v2); deleted once identified. Capped at 20.
  - [x] Home-screen "N photos waiting for signal" with view/remove/try again; processed one at a time with backoff on start, reconnect and focus; saved to the Field Journal like a normal identification.
  - [x] Quiet in-app toast; silent notification (asked when the first photo is queued) that opens the observation. No Background Sync: processing happens next time the app is open with signal.
- [x] **Battery- and data-light live mode.** Lower the live detector's frame rate when the phone is low on battery (Battery Status API where available) or getting warm, and add a data-saver setting (smaller uploads, fewer live frames).
  - Done: `src/features/live/framePolicy.ts` (pure policy). Low battery (<20%, not charging) slows the loop to 300 ms; a rising per-tick processing time (warm or throttled phone) backs it off up to 600 ms; data saver sends at most 8 frames per session (vs 15), waits longer between scans, and uploads 1024 px crops. A quiet "Low battery · Cooling down · Data saver" line shows under the Live pill.
- [x] **Settings page, expanded.** The first version holds today's identification usage. Add the "Name it first" toggle, units (metric/imperial), data saver, clear data, and the default camera mode (photo or live).
  - Settings live in `src/lib/settings.ts` (`useSettings()`, `useSetting(key)`, `getSetting(key)`, `setSetting(key, value)`). Units default from the device locale (imperial for the US).
  - [ ] Units still metric: the "about 10 km from your usual spots" weekly-goal text (`journal/goals.ts`, built outside React) and the ~1 km / ~11 km notes on the privacy and location screens.
- [x] **Install prompt.** A gentle "Add FieldLens to your home screen" nudge after the second use, so it opens full-screen like a native app (beforeinstallprompt on Android/Chrome; short instructions on iOS Safari).
- [x] **Live identify button: one green play circle.** The viewfinder shutter shows the black play icon inside the green shutter circle, a circle within a circle. Make the play icon itself the green button: a single green circle with the play triangle cut out, keeping the focus arc and ripple around it.
- [x] **Journal link: icon only.** In the top bar, show just the journal (book) icon instead of icon + "Journal", like the info and settings icons beside it. Keep an accessible label ("Field Journal") and the active state.
- [x] **Seasonality, stronger and visible.** Out-of-season matches (a plant flowering in January, a summer migrant in winter) should count for more in ranking and show on the result. Applies to plants, trees, birds, insects and more. Build on the eBird/range work once it's committed.
  - [x] Done 2026-09-28: extra out-of-season penalty (up to 10%) from local GBIF month and iNaturalist flowering records, and result evidence such as "Rarely recorded near you in January (mostly Jun–Sep)" and "In season: flowers here Apr–Jun".

## Gamification: collection depth

**Guidelines (owner, 2026-09-28):** made for adults, including adults getting into biology. Visual celebration is fine, such as stamps and short rank-up animations, but **no sounds**. Everything stays on the device for now; a small backend comes later.

Builds on the Field Journal and naturalist rank (done 2026-09-28). No rarity scores: record counts reflect how often people log a species, not how rare it is.

- [x] **Field-guide pages that fill in.** Tapping a species card opens a journal page that grows as you log more: first sighting, then "seen in 3 seasons", "seen in 2 places", "photographed the flower, leaf and bark". Completion is about knowing the species, not just ticking it off.
- [x] **Life stages and parts.** The same species counts extra for new parts or stages: monarch caterpillar vs butterfly, maple in flower vs fall colour, a mushroom cap vs its gills. Uses the part already recorded with each photo.
  - [x] Parts: results now save the photographed part (`features`); each extra part of a confident species earns a point and fills the species page.
  - [ ] Life stages (caterpillar vs butterfly, flowering vs fall colour): no data source yet.
- [x] **Family trees.** Group journal cards by genus or family ("Maples (Acer) · 3"). Finding 5 species in a genus or family earns a stamp, e.g. "Maple Family: 5 of 12 recorded near you".
  - [x] The "recorded near you" count, from real GBIF data: `POST /api/nearby-families` (coarse ~11 km cell, distinct species within 50 km via the speciesKey facet, cached 7 days). Uses the device location, else the most recent find's; hidden when offline.

## Gamification: journeys and places

- [x] **Explored areas on the globe.** Each ~10 km area where you've found something lights up on the journal globe. Milestones like "5 areas explored" and "a new province".
  - [ ] Province/state milestones (needs offline admin-boundary data; countries work).
- [x] **Home patch.** Set an area (home, cottage, a favourite trail) and track "species found at your patch" over time, to see seasonal change on places you return to.
- [x] **Seasonal wheel.** A 12-month ring per group that fills as you log finds in each month. "Fall fungi" and "spring flowers" become visual goals without time-limited events.

## Gamification: skill

- [x] **"Sharp eye" bonus.** Extra points when a follow-up answer or an added photo turns an uncertain identification into a confident one. Rewards good habits: photographing the right part, noting size and time.
  - [x] Done 2026-09-28: an added photo (or live frame of the deciding angle) that takes the same top species from low/none to medium/high saves `sharpEye` on the observation: +2 rank points, a "Sharp Eye" stamp, and a quiet note on the result.
  - [ ] Follow-up answers can't earn it yet: they only down-weight contenders on the device, so the top match's own confidence (and band) never rises. It would need answers to re-score the top, or a server round-trip.
- [x] **Name it first** (optional setting, **off by default**; aimed at adults getting into biology, not just kids). Before the result appears, you can guess the group or the name. A correct guess earns a "Called it" stamp; fun with kids. Needs a settings toggle.
  - [x] Done 2026-09-28: with the setting on, the first result of a session waits behind "What do you think it is?" (group chips and/or a typed name, "Just show me" to skip). Common or scientific name, case- and accent-insensitive; the genus, another species in it, or the head word ("maple") counts as close. Saved on the observation (`guess`); "Called It" (first correct guess on a confident find) and "Keen Namer" (10) stamps, shown only with the setting on or once a guess exists. A miss gets no comment. Not offered for live results, whose name was already shown over the camera.

## Gamification: streaks and gentle goals

- [x] **Weekly field goals.** Three small goals each week, generated from your own journal: "Find a new species", "Log something in a group you haven't tried", "Photograph bark". The streak counts weeks, not days, so it never feels like a chore.
  - [x] Add a "Photograph a part you haven't recorded" goal now that results save `features`.
- [x] **Daily "What's out now".** One species in season near you this month (from GBIF month data) as a soft challenge: "Goldenrod is at its peak near you. Can you find it?" `GET /api/whats-out` (month share vs the group's own month share, 50 km, cached 3 days); home card, one pick per day, prefers groups you log and skips species already in your journal, dismissible for the day.

## Gamification: rewards and polish

- [x] **Stamps and badges**, drawn as field-guide-style ink stamps on journal pages (only confident finds count):
  - [x] **First Light:** a find before 8 am.
  - [x] **Night Walker:** a nocturnal animal (EltonTraits activity data).
  - [x] **Tracker:** an identification from tracks or droppings.
  - [x] **Five Groups** (was "Five Kingdoms"): finds in 5 of the 7 journal groups.
  - [x] **Canopy:** 10 trees, counted from results where "Tree" was chosen (`requestedTarget`, saved on new results only).
  - [x] **Mycologist:** 10 fungi.
  - [x] **Family stamps:** 5 species in one family (or genus).
- [x] **Rank-up moments.** A short full-screen animation when you rank up, plus a new badge colour or journal cover per rank. Respects reduced motion.
- [x] **Specimen card sharing.** A shareable image in the app's style: your photo, the name, "Field Naturalist · 42 species", the date. Web Share API, falling back to a download. No accounts needed.

## Later

- [ ] Grow the curated high-risk list (`server/safety/highRisk.ts`), ideally reviewed by a local botanist/mycologist.
  - [x] 22 non-Wikipedia-sourced entries and 6 look-alike links added (2026-09-28).
  - [ ] Re-source the older Wikipedia-cited entries; expert review still wanted.
- [x] Show look-alike reference photos next to look-alike warnings.
  - [ ] Add a mock species with a look-alike so the photos show in demo mode.

- [ ] Delete the Hugging Face write token (`HF_DEPLOY_TOKEN` in `.env.local`, “fieldlens-setup” on huggingface.co) when not actively changing `hf-space/`.
- [ ] Bird sound ID with BirdNET running in the browser (check licence before any public launch).
  - [x] Researched: [docs/research/birdnet-browser.md](docs/research/birdnet-browser.md). Licence: v2.4 weights are non-commercial (CC BY-NC-SA), so a free public app with attribution is fine but any commercial launch isn't. V3.0 is CC BY-SA but still a preview. Plan: opt-in, about 58 MB TF.js model in a worker, with the Space as fallback.
  - [x] Audio windowing and ranking prototype (`src/features/listen/birdnet/`, not wired in yet).
  - [x] Fix `microphone=()` in `vercel.json`: it blocked Bird calls on the deployed site (now `microphone=(self)`).
  - [ ] Worker + model hosting + check against the Space on the 40-clip set (plan steps 2–8).
- [ ] Fix the TypeScript warnings in Vercel's build log.
  - [x] Local build is clean: `api/tsconfig.json` type-checks with no errors, and the >500 kB chunk warning is fixed (screens off the photo path load lazily; React/zod/idb in a `vendor` chunk).
  - [ ] Confirm on the next Vercel deploy's build log; if warnings remain, paste them here.
- [ ] Optional: ask iNaturalist about paid partner access to their vision model.

## Gamification: looking back

- [x] **Year in review.** A private year-end summary built on the device from the journal: species count, busiest month, first-ever fungi (and other firsts), favourite place, new groups explored. Quiet and visual, no sounds; something nice to look back on.

## Later version: social and citizen science

These need accounts or a small backend, so they're planned for a later version of the app.

- [ ] **Family or group journal.** Share a journal code with family or a class to see a combined species count and each other's finds. Needs a small backend (and a privacy review: no exact locations shared).
- [ ] **Contribute to science.** Link an iNaturalist account and post good finds as real observations, with a badge when one reaches "research grade". Needs iNaturalist OAuth account linking.
