# FieldLens

**Identify the living world around you.** FieldLens is a mobile-first, installable web app (PWA) that works like an automated field guide: take a photo, box the organism, and get a ranked identification with its evidence — visual confidence, local occurrence records, sourced facts, alternatives, and a separate _From iNaturalist_ card with nearby community observations.

**Live demo: https://field-lens-eight.vercel.app**

> Live identification is enabled (Pl@ntNet key set in Vercel). To switch the deployment to fixture data instead, set `USE_MOCK_API=true` in Vercel → Settings → Environment Variables and redeploy.

v1 identifies **plants** (via Pl@ntNet) and, experimentally, **insects, spiders, fungi and birds** (via BioCLIP 2 on our own Hugging Face Space). Plant and mushroom results include a sourced **Edibility & safety** section (Wikipedia quotes, Wikidata, the TPPT toxic-plant database and a curated high-risk list) that never says anything is safe to eat. The architecture is taxonomy-neutral, so birds, insects, fungi and other groups plug into the same pipeline later.

> “FieldLens” is a working name. The visible name lives in [`src/config/brand.ts`](src/config/brand.ts).

<!-- Screenshots: add images to docs/screenshots/ and link them here. -->

| Home         | High confidence | Low confidence | From iNaturalist |
| ------------ | --------------- | -------------- | ---------------- |
| _screenshot_ | _screenshot_    | _screenshot_   | _screenshot_     |

## What it does

1. Take a photo (rear camera) or choose one from the library.
2. Drag a box around what you want identified (touch handles, reset, use whole image).
3. Optionally say what part you photographed (flower, leaf, fruit, bark, whole plant).
4. The cropped, EXIF-stripped JPEG is sent to `/api/identify`.
5. You get:
   - common and scientific names, family, and a confidence **band** (high ≥ 80%, medium ≥ 55%, low)
   - _Why this match?_ — only evidence the system actually has
   - alternative candidates, each with image-match score and local-record support
   - sourced facts (GBIF, IUCN via GBIF, Wikidata, Wikipedia) with attribution
   - geographic evidence (GBIF records within 5 / 25 / 100 km)
   - a visually separate **From iNaturalist** card (nearby counts, recent observations, seasonality)
   - related species recorded nearby — clearly labeled as _not_ alternatives
   - category-aware guidance for a follow-up photo when confidence is low
6. Results are saved locally (IndexedDB) — no account, no exact coordinates.

## Architecture

```mermaid
flowchart TD
  subgraph Browser["Browser / PWA"]
    UI[React UI<br/>camera · crop · results · history]
    IDB[(IndexedDB<br/>local history)]
    SW[Service worker<br/>offline shell]
    UI --> IDB
  end

  UI -- "multipart: cropped JPEG(s), category,<br/>features, ~1 km coords" --> API

  subgraph Server["Serverless API (Vercel functions)"]
    API["/api/identify"] --> V[Upload validation<br/>MIME sniffing · size · dims]
    V --> R{Category router}
    R -- plant --> PN[PlantNetIdentificationProvider]
    R -. future .-> BIRD[BirdIdentificationProvider …]
    PN --> TAX[GBIF taxonomy resolution]
    TAX --> OCC[GBIF occurrence evidence<br/>5/25/100 km + months]
    OCC --> RR[DeterministicGeoReranker]
    RR --> FACTS[Facts: GBIF · Wikidata · Wikipedia]
    RR --> INAT[iNaturalist nearby summary]
    RR --> NEAR[GBIF nearby related species]
    FACTS & INAT & NEAR --> RESP[Normalized response]
    CACHE[(In-memory TTL cache)]
    TAX & OCC & FACTS & INAT -.-> CACHE
  end

  PN <--> PlantNet[(Pl@ntNet API)]
  TAX & OCC & NEAR <--> GBIF[(GBIF API)]
  INAT <--> iNat[(iNaturalist API)]
  FACTS <--> Wiki[(Wikidata / Wikipedia)]
```

Supporting sources run in parallel with per-source deadlines. If GBIF, iNaturalist, or Wikipedia fail, the identification still returns and the UI shows which source was unavailable. Only the visual identification step can fail a request.

### Code layout

```
shared/            Domain types, zod schemas, config (weights, bands, limits), category registry, geo privacy
server/
  http/            Web-standard Request→Response handlers + Vite dev middleware
  identify/        Pipeline orchestration, evidence & guidance builder
  providers/       plantnet/ gbif/ inaturalist/ wiki/ mock/ + registry.ts (wiring)
  ranking/         CandidateReranker interface + DeterministicGeoReranker
  cache/           Cache interface + MemoryCache
  validation/      Upload parsing, MIME sniffing, dimension checks
  lib/             env, errors, fetch-with-timeout, logger, rate limiter
api/               Thin Vercel function entry points (identify, health)
src/
  app/             App shell, hash router
  features/        camera/ crop/ identification/ results/ history/ location/ privacy/
  components/      UI primitives and icons
  lib/             API client (the only place that calls the API), image processing, formatting
tests/             unit/ component/ e2e/ live/ fixtures/
```

Provider code is kept out of `api/` because Vercel turns every file in `api/` into a function.

## Local setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local
npm run dev:mock        # fully usable with fixtures — no API key, no quota used
# or, with a Pl@ntNet key in .env.local:
npm run dev
```

Open the printed URL. On a phone on the same Wi-Fi, use the network URL — note that camera and geolocation require HTTPS on phones, so use the deployed site (or a tunnel) for full mobile testing; the photo-library path works anywhere.

### Environment variables

| Variable            | Where       | Purpose                                                                                                            |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `PLANTNET_API_KEY`  | server only | Live plant identification. Free key at [my.plantnet.org](https://my.plantnet.org/). **Never** prefix with `VITE_`. |
| `USE_MOCK_API`      | server      | `true` serves fixtures for every provider (dev, CI, demos).                                                        |
| `APP_NAME`          | server      | Name reported by `/api/health`.                                                                                    |
| `PLANTNET_PROJECT`  | server      | Optional Pl@ntNet flora (default `all`).                                                                           |
| `HF_TOKEN`          | server only | Read-only Hugging Face token for the private BioCLIP Space (insects & spiders).                                    |
| `BIOCLIP_SPACE_URL` | server      | The Space's URL, e.g. `https://mintmundane-fieldlens-bioclip.hf.space`.                                            |

GBIF, iNaturalist, Wikidata and Wikipedia need no keys.

### Mock mode

With `USE_MOCK_API=true`, the home screen shows a **Demo mode** selector (and `?mock=<scenario>` works in the URL):
`high`, `medium`, `low`, `zero`, `gbif-down`, `inat-down`, `quota`, `network`, `timeout`. Location-unavailable is exercised by declining location. Fixture species and GBIF keys are real; scores and counts are synthetic.

## Providers

| Source                                                                     | Used for                                                                               | Notes                                                                                        |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Pl@ntNet](https://my.plantnet.org/)                                       | Plant image identification                                                             | Up to 5 images of one plant, organ hints. Reference images shown only with author + license. |
| [GBIF](https://techdocs.gbif.org/)                                         | Taxonomy, occurrence counts by radius and month, IUCN category, related nearby species | Coordinates rounded to ~1 km before querying.                                                |
| [iNaturalist](https://www.inaturalist.org/pages/api+recommended+practices) | Separate “From iNaturalist” card                                                       | Cached 45 min. Only CC-licensed photos shown. Not used in the confidence score.              |
| [Wikidata](https://www.wikidata.org/)                                      | Common names, Wikipedia title (via GBIF ID, P846)                                      | CC0                                                                                          |
| [Wikipedia](https://en.wikipedia.org/)                                     | Lead-section summary                                                                   | CC BY-SA 4.0, attributed                                                                     |
| [POWO (Kew)](https://powo.science.kew.org/)                                | Reference link only                                                                    | See DECISIONS.md                                                                             |

## Ranking

`finalConfidence = visual × (wV + wG·geo + wS·season) / (wV + wG + wS)` over available factors, with weights 0.80 / 0.15 / 0.05 (or 0.80 / 0.20 without reliable seasonal data). This means local commonness can **never raise** a candidate above its image score — it can only discount candidates that lack local evidence (by at most ~11% when there are no records within 100 km). All weights, radii and bands are in [`shared/config.ts`](shared/config.ts).

## Privacy behavior

- Photos are cropped, downscaled and re-encoded in the browser, which strips EXIF (including GPS tags). Originals never leave the device.
- Location is optional and rounded to 2 decimals (~1 km) on the device, and again on the server.
- Server logs in production contain event names and counts only — no photos, coordinates, keys or payloads.
- Local history stores a thumbnail, the result, and a ~10 km label; exact and approximate coordinates are removed before saving. _About → Clear Local Data_ wipes everything.
- Rate limiting uses a daily-salted hash of the client IP held only in memory.

## Testing

```bash
npm run lint           # ESLint
npm run typecheck      # tsc -b (app, server, node configs)
npm test               # unit + component tests (Vitest, jsdom)
npm run test:e2e       # Playwright against the production build with the mock API
npm run test:live      # opt-in: real GBIF / iNaturalist / Wikidata / Wikipedia (and Pl@ntNet if keyed)
npm run build
```

On macOS versions Playwright no longer ships browsers for, use an installed Chrome: `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`.

E2E covers: upload → crop → identify (high/medium/low), crop handle resizing, follow-up photo, declined and granted location, the iNaturalist card and its outage state, GBIF outage, quota errors, history reload, and the offline shell with retry-on-reconnect.

## Deployment (Vercel)

1. Import the GitHub repo in Vercel (framework preset: Vite — `vercel.json` already sets build, output and function limits).
2. Add `PLANTNET_API_KEY` under _Settings → Environment Variables_ (Production + Preview).
3. Deploy. Check `https://<your-app>/api/health` — `plantIdentificationConfigured` should be `true`.
4. To demo without a key, set `USE_MOCK_API=true` instead.

GitHub Pages alone won’t work: it can’t hold a server-side secret (see DECISIONS.md). CI (`.github/workflows/ci.yml`) runs lint, format check, typecheck, unit/component tests, build and Playwright on every push and PR, with mocks only.

## Attribution

Plant identification by [Pl@ntNet](https://plantnet.org/). Occurrence and taxonomic data from [GBIF.org](https://www.gbif.org/). Community observations from [iNaturalist](https://www.inaturalist.org/). Names from [Wikidata](https://www.wikidata.org/) (CC0); summaries from [Wikipedia](https://en.wikipedia.org/) (CC BY-SA 4.0). Every result screen lists the sources it used.

## Known limitations

- Only plants are identifiable today; other categories show “Soon”.
- Pl@ntNet’s free tier has a daily request quota; the in-memory rate limit (10 identifications / 10 min / client) is per serverless instance.
- Caches are in-memory per instance, so cold starts re-fetch supporting data.
- GBIF record counts reflect sampling effort as much as abundance; they’re evidence, not proof.
- Native/introduced range isn’t shown yet (planned via POWO — see ROADMAP.md).
- Camera and geolocation need HTTPS on phones.

## Roadmap

See [ROADMAP.md](ROADMAP.md). Design decisions are recorded in [DECISIONS.md](DECISIONS.md).

## License

MIT — see [LICENSE](LICENSE).
