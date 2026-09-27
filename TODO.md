# TODO

Near-term, actionable work. Longer-term ideas live in [ROADMAP.md](ROADMAP.md); provider research in [docs/research/identification-providers.md](docs/research/identification-providers.md).

## In progress

- [ ] **Run our own BioCLIP 2 on Hugging Face** (free ZeroGPU Space) as the identification service for non-plant groups.
  - [ ] Create the Space under the owner's account (Gradio + ZeroGPU; account must be verified and 30+ days old).
  - [ ] Endpoint: photo(s) + optional species list → ranked species with scores; cache species-list text embeddings per area.
  - [ ] Keep the public `imageomics/bioclip-2-demo` Space as a fallback.
  - [ ] Store a read-only `HF_TOKEN` in Vercel (server-side only) so calls use the owner's daily GPU quota (5 min/day on a free account).
  - [ ] Temper BioCLIP 2's overconfident scores before mapping them to confidence bands.

## Next

- [ ] `BioclipIdentificationProvider` for insects & spiders, using GBIF species recorded nearby as the candidate list.
- [ ] Fungi with the safety package: never show "edible", dangerous look-alike warnings (Amanita, Galerina, Lepiota, Gyromitra, Cortinarius, Inocybe, Clitocybe), prefer genus answers, stronger notice.
- [ ] Birds (optionally eBird nearby observations as a prior), then mammals, reptiles, amphibians.
- [ ] "Auto" category detection with BioCLIP 2 at class/kingdom level.
- [ ] Measure accuracy on real phone photos for each group before removing the "experimental" label.

## Later

- [ ] Bird sound ID with BirdNET running in the browser (check licence before any public launch).
- [ ] Fix the TypeScript warnings in Vercel's build log.
- [ ] Optional: ask iNaturalist about paid partner access to their vision model.
