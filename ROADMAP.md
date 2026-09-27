# Roadmap

v1 (done): plant identification, GBIF geographic evidence with deterministic reranking, separate iNaturalist card, sourced facts, follow-up photos, local history, installable PWA with offline shell.

Nothing below is built yet. Each item should reuse the existing provider interfaces and category registry.

## More organisms

Provider research (options, pricing, licences, recommended order): [docs/research/identification-providers.md](docs/research/identification-providers.md). Recommended order: insects & spiders (Kindwise insect.id) → fungi (Kindwise mushroom.id + safety package) → a self-hosted BioCLIP 2 service for Auto detection, birds (with eBird priors), mammals, reptiles and amphibians → bird sound (BirdNET).

- **Birds** — research photo-ID providers; bird-specific features (whole bird, head, wing, feather) already exist in the registry.
- **Insects and spiders** — top-down / side-view guidance is already written.
- **Fungi** — cap, underside and stem features exist; safety messaging is critical here.
- **Mammals, reptiles, amphibians, fish, marine life.**
- **Tracks, scat and signs.**
- **Automatic category detection** — an “Auto” option that routes to a top-level classifier before the category provider.

## Better evidence

- **Jev reranker experiment** behind `CandidateReranker`, A/B-compared with `DeterministicGeoReranker`.
- **POWO / Kew integration** for native and introduced ranges, once a documented or licensed data route is confirmed.
- **Native range polygons** and range-based geographic support instead of only point counts.
- **Phenology models** (flowering/activity windows) to replace the simple month-window seasonal support.
- **Guided identification questions** (e.g. “Are the leaves opposite or alternate?”) sourced from structured keys, never generated.
- **Shared cache** (Vercel KV / Upstash) so cold starts don’t re-query GBIF and iNaturalist.

## Offline and field use

- Offline regional species packs and a cached field guide.
- Queued identifications that send automatically when back online.
- Small on-device regional models for rough offline suggestions.

## Personal field guide

The history schema is versioned and indexed by scientific name to support:

- user accounts (optional) and sync — likely PostgreSQL + PostGIS
- life list, species count, first/last seen
- map of sightings (opt-in precise location per observation)
- favorites, collections, trip lists, country/region lists
- shareable sightings
- invasive species alerts for the user’s region

## Platform

- Native-app wrapper (Capacitor) if camera or background features require it.
- Optional submission of observations to iNaturalist (with the user’s account and explicit consent).
