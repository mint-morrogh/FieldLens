# TODO

Near-term, actionable work. Longer-term ideas live in [ROADMAP.md](ROADMAP.md); provider research in [docs/research/identification-providers.md](docs/research/identification-providers.md).

## In progress

Live: private Space `mintmundane/fieldlens-bioclip` (ZeroGPU), source in `hf-space/`, redeploy with `npm run space:deploy`. Verified 2026-09-27: monarch, blue jay and fly agaric correct in 1–2 s per call.

- [x] **Run our own BioCLIP 2 on Hugging Face** (free ZeroGPU Space) as the identification service for non-plant groups.
  - [x] Create the Space under the owner's account (Gradio + ZeroGPU; account must be verified and 30+ days old).
  - [x] Endpoint: photo(s) + optional species/genus list → ranked species with scores (uses precomputed embeddings for ~867k taxa, so no per-call text encoding); also rank-level output (e.g. class) for Auto detection.
  - [ ] Keep the public `imageomics/bioclip-2-demo` Space as a fallback.
  - [x] Store a read-only `HF_TOKEN` in Vercel (server-side only) so calls use the owner's daily GPU quota (5 min/day on a free account).
  - [x] Temper BioCLIP 2's scores: weighted by how much the photo looks like the chosen group, capped at 90% while experimental. Revisit with real-photo measurements.

## Next

- [ ] **Edibility & safety section** (plants first, then fungi), researched sources only:
  - [x] Research free, reusable sources — see [docs/research/edibility-sources.md](docs/research/edibility-sources.md) (Wikipedia sections + Wikidata P789 + bundled TPPT; Canadian/FDA databases are gone).
  - [ ] Quote sourced statements with links; never "safe to eat"; include plant part and preparation when stated.
  - [ ] Edible notes only on high-confidence results; toxic warnings and known toxic look-alikes shown at any confidence.
  - [ ] Fungi: stricter — prominent expert-confirmation warning on any edible statement; dangerous look-alike genera always flagged.
  - [ ] Permanent footer: "Never eat a wild plant or mushroom based on an app — confirm with a local expert."

- [x] Insects & spiders via `BioclipIdentificationProvider` (experimental label, confidence capped at 90%, “does this look like an insect?” check with a one-tap category switch, iNaturalist common names). Geographic support comes from the existing GBIF reranker.
- [ ] Fungi with the safety package: never show "edible", dangerous look-alike warnings (Amanita, Galerina, Lepiota, Gyromitra, Cortinarius, Inocybe, Clitocybe), prefer genus answers, stronger notice.
- [ ] Birds (optionally eBird nearby observations as a prior), then mammals, reptiles, amphibians.
- [ ] "Auto" category detection with BioCLIP 2 at class/kingdom level.
- [ ] Measure accuracy on real phone photos for each group before removing the "experimental" label.

## Later

- [ ] Delete the Hugging Face write token (`HF_DEPLOY_TOKEN` in `.env.local`, “fieldlens-setup” on huggingface.co) when not actively changing `hf-space/`.
- [ ] Bird sound ID with BirdNET running in the browser (check licence before any public launch).
- [ ] Fix the TypeScript warnings in Vercel's build log.
- [ ] Optional: ask iNaturalist about paid partner access to their vision model.
