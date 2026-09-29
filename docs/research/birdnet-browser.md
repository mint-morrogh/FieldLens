# BirdNET in the browser

_Research date: 2026-09-28. Licences, model versions and browser support change; re-check before launching publicly. Numbers marked **(measured)** were checked from the downloaded files; **(estimate)** means not measured on a phone._

## TL;DR

- **Today:** Bird calls records on the phone, converts the clip to 48 kHz mono WAV, and sends it to our Hugging Face Space. The Space runs **BirdNET v2.4 TFLite** (acoustic model plus location model) on CPU (`hf-space/birdnet_audio.py`, `server/providers/birdnet/birdnet.ts`).
- **Update 2026-09-28: the opt-in on-device mode is built** (§7). The owner decided FieldLens stays personal and non-commercial, so the v2.4 licence is acceptable. Settings → "Identify bird calls on this device" downloads the model (59.6 MB) into its own cache; Listen then runs BirdNET in a worker and sends only the result to the server for enrichment, falling back to the Space if the model isn't ready or fails. On 4 real recordings (8 runs with and without location) it gave the **same species, in the same order, as the Space, with scores within 0.0001**.
- **Running it in the browser works.** BirdNET's own team ships it: [BirdNET Live](https://github.com/birdnet-team/real-time-pwa) runs v2.4 with **TensorFlow.js (WebGL)** in a Web Worker, with the location model, fully offline. The model's first layer computes the spectrogram, so the page only supplies raw 48 kHz samples in 3 s windows.
- **Download size:** about **58 MB** for v2.4 (52 MB acoustic model + 6.8 MB location model + 0.26 MB labels) plus about 0.4 MB (gzipped) for the TF.js runtime **(measured)**. The weights hardly compress (about 7% with gzip). BirdNET+ V3.0 preview is about 72 MB (pruned FP16 ONNX) plus about 13 MB for the ONNX Runtime WASM file.
- **Licence verdict:** v2.4 weights are **NonCommercial** (CC BY-NC-SA 4.0 in the Analyzer README; the Zenodo record says CC BY-NC 4.0). They're **fine for a free, non-commercial public app with attribution**, which is already true of today's server-side use. They're **not OK for any commercial launch** (ads, paid tier, paid app, sponsorship) unless Cornell grants a licence. **BirdNET+ V3.0** is CC BY-SA 4.0, which allows commercial use, but it's a changing "developer preview" whose terms also say it's "provided solely for research and evaluation". It isn't a safe base for shipping until a stable release.
- **Recommendation:** keep the Space as the default. Add an optional on-device mode ("Identify calls offline") using the v2.4 TF.js model in a worker, downloaded only when the user turns it on and cached separately from the app shell. Its output goes through the same ranking the Space uses (prototype in `src/features/listen/birdnet/`). Revisit V3 when it's final.
- **Unrelated bug found:** `vercel.json` sends `Permissions-Policy: microphone=()`, which **blocks the microphone on the deployed site**. Bird calls can't record in production until it's changed to `microphone=(self)`. This matters whether inference runs on the server or on the device. (I didn't change it: out of scope for this task.)

## 1. What the app does today

| Step | Where | Details |
| --- | --- | --- |
| Record | Phone (`ListenScreen.tsx`) | `MediaRecorder`, 3–15 s. Echo cancellation, noise suppression and auto-gain off. Live spectrogram from an `AnalyserNode`. |
| Convert | Phone (`src/lib/audio.ts`) | `decodeAudioData` → `OfflineAudioContext` at 48 kHz mono → 16-bit WAV (about 1 MB per 10 s). |
| Upload | `/api/identify` → `BirdnetCallProvider` | Base64 WAV plus lat/lon/week sent to the Space's `identify_audio`. |
| Inference | HF Space, CPU (`hf-space/birdnet_audio.py`) | BirdNET v2.4 TFLite via `ai-edge-litert`, 3 s windows with 1.5 s hop. Sigmoid, then ranked by the mean over windows. Location model filter at 0.03. Noise classes held back. About 0.3 s per 10 s of audio. |
| Enrich | Server pipeline | Taxonomy, GBIF, eBird, ranges, facts. Confidence capped at 0.95 (`CALL_CONFIDENCE_CAP`). |

Measured quality (DECISIONS.md): top-1 36/40 and top-3 37/40 on real phone recordings, using location.

Moving inference onto the phone would keep the recording on the device, work offline, and remove the Space as a dependency and a cold-start delay. The server would still be needed for enrichment (see §6).

## 2. Model options

| Model | Formats | Size | Input | Classes | Location model | Licence (weights) |
| --- | --- | --- | --- | --- | --- | --- |
| **BirdNET v2.4** ([Zenodo 15050749](https://zenodo.org/records/15050749)) | Keras, protobuf, **TF.js** (75 MB zip), **TFLite** FP32 (77 MB zip) / **FP16** (53 MB) / **INT8** (46 MB) | TF.js as shipped by BirdNET Live: **52 MB** (13 shards, all float32) **(measured)** | 144,000 samples = 3 s at 48 kHz, raw audio. Mel spectrogram inside the model (`MelSpecLayerSimple` custom layer). | 6,522 (birds plus a few noise and non-bird classes). Labels `Scientific_Common`, 27 languages | Yes: `[lat, lon, week]` → 6,522 occurrence scores. TF.js graph model is **6.8 MB** | CC BY-NC-SA 4.0 (README) / CC BY-NC 4.0 (Zenodo metadata) |
| **BirdNET+ V3.0 dev preview 3.1** ([Zenodo 20703646](https://zenodo.org/records/20703646), [repo](https://github.com/birdnet-team/birdnet-V3.0-dev)) | PyTorch, **ONNX** FP32 (542 MB) / FP16 (272 MB) / **pruned FP16 (71.5 MB)**, TFLite (same sizes) | 71.5 MB (browser demo's choice) | **32 kHz**, variable length (demo uses 3 s chunks) | ~11,000, including more non-bird species. "Species list needs a cleanup" | **None published yet.** Would need our own filter (eBird/GBIF, as for photos) | CC BY-SA 4.0 plus Terms of Use (see §3) |
| BirdNET-Lite (old) | TFLite | — | — | ~6k | — | CC BY-NC-SA 4.0. Replaced by Analyzer and v2.4 |

Community ports and apps:

- **[BirdNET Live / real-time-pwa](https://github.com/birdnet-team/real-time-pwa)** (official, MIT code). Plain JS plus TF.js 4.x, WebGL backend in a Web Worker, AudioWorklet for mic capture, service worker with a separate versioned model cache. It pools windows with log-mean-exp (α = 5), has a sensitivity slider, and uses the location model. It ships the v2.4 weights but its README labels the models "CC BY-SA 4.0". That contradicts the Analyzer and Zenodo licences for v2.4, so don't rely on it. Last commit Dec 2025, still marked "in active development".
- **[georg95/birdnet-web](https://github.com/georg95/birdnet-web)** is the base BirdNET Live's worker was built from. It contributes the WebGL STFT kernel and has WebGL/WebGPU benchmarks. **The repo has no licence file**, so by default its code can't be reused. BirdNET Live's MIT licence covers its own worker, but where the kernel came from is unclear. **Write our own STFT/Mel code** (or ask either author) rather than copying it.
- **[Chirpity](https://github.com/Mattk70/Chirpity-Electron)** is a desktop Electron app that bundles `BirdNET_GLOBAL_6K_V2.4_Model_TFJS` plus its own nocturnal-migration model. It's a good sign that the TF.js v2.4 conversion is reliable, but it isn't a browser library.
- **V3.0 `web-demo/`** is TypeScript with `onnxruntime-web` 1.26 (WASM provider; the comments say WebGL has operator problems with this export) and `fft.js` for display only. It's file-upload only, not live.

## 3. Licence

**Code.** BirdNET-Analyzer, BirdNET Live and the V3 repo are all **MIT**, so reusing them is fine with the copyright notice.

**v2.4 weights (what we use now).**

- The [BirdNET-Analyzer README](https://github.com/birdnet-team/BirdNET-Analyzer) says: "The models used in this project are licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0)… All educational and research purposes are considered non-commercial use and it is therefore freely permitted to use BirdNET models in any way."
- The Zenodo record's metadata says `cc-by-nc-4.0` (no ShareAlike). Either way it's **NonCommercial**. Treat it as the stricter one, BY-NC-SA.
- What that means for FieldLens:
  - **Free public app, no ads, no payments, no sponsorship:** allowed. We need attribution (BirdNET / K. Lisa Yang Center, Cornell Lab and TU Chemnitz), a link to the licence, and a note of any changes. We already show `BIRDNET_ATTRIBUTION`. On-device use sends the weights to every user's browser, which counts as *sharing* under CC. That's allowed with the same notices, so the licence file and credit should sit next to the model files.
  - **ShareAlike:** if we convert or quantize the weights (for example to INT8 or ONNX), the result is an adaptation and must also be CC BY-NC-SA. The rest of FieldLens's code isn't affected.
  - **Anything commercial** (ads, subscriptions, paid app-store listing, paid B2B use, possibly a donations-funded service run by a company) breaks the NonCommercial clause. CC defines NonCommercial as "not primarily intended for or directed towards commercial advantage or monetary compensation", and where the line falls is a judgment call. The Space setup has exactly the same problem today; moving to the browser doesn't make it better or worse.
- **Commercial licensing:** no published programme or price. The team's contact for use-case questions is **ccb-birdnet@cornell.edu**. Treat any commercial deal as case by case.

**V3.0 preview weights.** The Zenodo licence is **CC BY-SA 4.0**. Its [TERMS_OF_USE](https://github.com/birdnet-team/birdnet-V3.0-dev/blob/main/TERMS_OF_USE.md) says "You may use (including commercially)" with attribution ("Powered by BirdNET"). It bans use for poaching or illegal wildlife tracking and for **any military purpose**, and says these bans override the licence. But the same document calls the models "Provided solely for research and evaluation", and the model, labels and code "will change". For permissions, it says to contact stefan.kahl@cornell.edu.

**Location model and eBird.** The v2.4 location model was trained on eBird checklist data and ships in the same Zenodo record under the same licence. We don't use eBird data directly for it.

**Verdict.**

| Scenario | v2.4 in the browser | V3 preview in the browser |
| --- | --- | --- |
| Free, non-commercial public app (as now) | **OK** with attribution, licence link and a notice next to the model | Allowed by the licence, but "research and evaluation" wording plus preview churn. Wait for the final release |
| Any commercial launch | **No**, unless Cornell grants a licence | Likely OK on the final release under CC BY-SA. Get written confirmation first |

## 4. Runtimes

| Runtime | Fits | Download | Notes |
| --- | --- | --- | --- |
| **TF.js 4.x, WebGL backend** | v2.4 TF.js layers model, used by BirdNET Live | `tf.min.js` 1.47 MB, **0.37 MB gzipped** **(measured)**. Could be smaller with a custom bundle of just `tfjs-core`, `tfjs-layers` and `tfjs-backend-webgl` | Well-tested path. Needs the custom `MelSpecLayerSimple` layer registered, plus an STFT (its own WebGL kernel, or `tf.signal.stft`). WebGL in a worker needs `OffscreenCanvas` (Safari 16.4+). Compiling shaders on first run takes a few seconds, so warm up once after loading. |
| TF.js WASM backend | Fallback for older phones | 0.42 MB `.wasm` (SIMD) **(measured)** | Works without cross-origin isolation (single-threaded then). Slower than WebGL, but no GPU driver problems. |
| **LiteRT.js** (`@litertjs/core`, [docs](https://developers.google.com/edge/litert/web), released July 2026) | The **same `.tflite` files the Space runs** (FP16 53 MB, INT8 46 MB) | Not measured | Replaces `@tensorflow/tfjs-tflite`. WebGPU (on by default in Safari 26 and Chrome) with a WASM/XNNPACK fallback. Promising because results would match the Space exactly, but it's new. Check that BirdNET's in-model spectrogram ops (RFFT) are supported before choosing it. |
| `@tensorflow/tfjs-tflite` | — | — | Superseded by LiteRT.js. Don't start on it. |
| **ONNX Runtime Web** | V3 (ONNX) | `ort-wasm-simd-threaded.wasm` **13 MB** **(measured)** | The V3 demo uses the WASM provider. Multithreading needs `crossOriginIsolated` (COOP/COEP headers), which would break the third-party photos we embed (iNaturalist, Wikimedia) unless we use `COEP: credentialless`, which Safari doesn't support. Plan for single-threaded. |

**Performance (estimate).** v2.4 is an EfficientNetB0-like model: small per window. On the Space's 2 CPU threads it runs a 10 s clip (6 windows) in about 0.3 s. On a mid-range phone with WebGL, expect roughly **0.1–0.5 s per 3 s window** once warm, and a **2–6 s first load** (read about 58 MB from cache, upload to the GPU, compile shaders). Live listening needs one inference every 1.5 s, which is comfortably real-time. **Measure on a real mid-range Android and an older iPhone before committing.** BirdNET Live's own note: "performance may vary across devices and browsers."

**Memory.** Float32 weights are about 52 MB on the GPU, plus activations, and a 6,522-class output per window. Fine on current phones. On iOS, Safari can kill a tab that uses too much memory, so load the model in a worker and `dispose()` tensors.

**Battery.** Keep the current tap-to-record design: record 3–15 s, then run inference once (6–10 windows). That costs roughly a second of GPU time per ID. Continuous live mode (like BirdNET Live) keeps the mic, the worker and the GPU busy. If we add it, stop when the page is hidden, pause after about 2 minutes, and skip windows that are nearly silent (a cheap RMS check before inference).

**Caching.** Don't add the model to Workbox's precache (`globPatterns`): it would download 58 MB for every install. Instead:

- Load it on demand from the worker and store it in a separate, versioned cache (`caches.open('birdnet-v2.4')`). Alternatively add a Workbox `runtimeCaching` rule for `/models/birdnet/` with `CacheFirst` and no expiry.
- Call `navigator.storage.persist()` so iOS or Android is less likely to evict it.
- Show download progress. Only offer the download on Wi-Fi, or after the user confirms the size.
- Host the files either on Vercel as static files (58 MB × every opt-in user counts against the Hobby plan's bandwidth) or in a public Hugging Face model repo with CORS (free, and fits the existing Space account). Keep the licence file and README next to the weights.

## 5. Recommended approach

1. **Default stays on the server.** The Space is accurate, cheap, and needs no download. Fix the `microphone=()` header first.
2. **Add an opt-in on-device mode** using the **v2.4 TF.js model from the official release** (Zenodo `BirdNET_v2.4_tfjs.zip`, the same weights BirdNET Live uses), run with **TF.js WebGL in a Web Worker** and a WASM fallback. Pick TF.js over LiteRT.js for now because it's proven for this exact model. Test LiteRT.js with the TFLite file in parallel: if its speed and op support hold up, switching would make on-device results identical to the Space's.
3. **Same audio front end and ranking as the Space**, so the two modes agree:
   - mono, 48 kHz, 3 s windows with 1.5 s hop, padded trailing window;
   - sigmoid, ranked by mean over windows, best window as `score`, location model filter at 0.03, noise classes held back.

   Prototype: `src/features/listen/birdnet/`.
4. **V3 later:** when BirdNET+ V3 is final (stable labels and terms, ideally with a location model), re-evaluate it. It's the path to commercial use. Accuracy needs our 40-clip test set again, since its labels and noise handling differ.

## 6. Implementation plan

Done in the first change (the prototype, now used by the worker):

- `src/features/listen/birdnet/audioWindows.ts`: `toMono`, `resample` (band-limited windowed sinc, for browsers that ignore the requested `AudioContext` rate), the streaming `WindowChunker` (for live mic input) and `frameWindows`/`toBatch`. Configs for v2.4 (48 kHz) and the V3 preview (32 kHz). Window starts match the Space's `_segments` exactly.
- `src/features/listen/birdnet/scores.ts`: `parseLabels`, `sigmoid`, `birdnetWeek`, `geoInput`, and `rankDetections`, a port of `identify_audio` that returns the Space's `BirdnetResponse` shape.
- `tests/unit/birdnetAudio.test.ts`: 18 tests. Framing matches the Space for 0.5–15 s clips, streaming matches batch, resampling keeps a 3 kHz tone and removes a 20 kHz tone when going to 32 kHz, ranking/location/noise rules work, and week numbers match the server. No model download.

Next steps as planned (steps 1–7 are now done; see §7 for what was built and what changed from this plan):

1. **Fix the mic header** in `vercel.json` (`microphone=(self)`).
2. **Model hosting:** publish the v2.4 TF.js files, labels (`en_us`, plus other locales if needed), `LICENSE` and a README to a HF model repo, pinned by revision. Add a `models/birdnet` manifest with SHA-256 hashes.
3. **Worker** (`src/features/listen/birdnet/worker.ts`): add TF.js as a **new dependency** (`@tensorflow/tfjs-core`, `-layers`, `-backend-webgl`, `-backend-wasm`, dynamically imported so the main bundle doesn't grow). Write our own `MelSpecLayerSimple` (a port of the Keras layer using `tf.signal.stft`, or our own WebGL FFT; not copied from birdnet-web). Load from cache or the network with progress, warm up once, then take `Float32Array` batches from `toBatch` and return per-window probabilities.
   - **Validate** against the Space: run the 40-clip set through both and require the same top-1 on at least 39/40 and scores within 0.02.
4. **Location model:** run `area-model` once per session with `geoInput(lat, lon, birdnetWeek(date))` and cache the 6,522 scores per place and week.
5. **Pipeline hook:** decide how on-device candidates reach enrichment. Either (a) move `toCallCandidates` into `shared/` and add an `/api/identify` mode that accepts precomputed BirdNET results (JSON, no audio) and still runs taxonomy, GBIF, eBird and facts; or (b) enrich on the device as far as possible and fetch the rest when back online. Option (a) is less work and keeps the recording on the phone.
6. **Settings UI:** a "Identify calls on this device" switch showing the download size (about 58 MB), `navigator.storage.persist()`, a "Remove model" button, and automatic fallback to the Space if the model isn't cached or WebGL fails.
7. **Attribution:** keep `BIRDNET_ATTRIBUTION` on results. Add the model licence and changes note to the privacy/sources page.
8. **Measure** load time, time per window, memory and battery on a mid-range Android (Chrome) and an iPhone 12-class device (Safari 26). Only ship if a warm ID of 10 s audio takes under 2 s.
9. **Optional live mode** (later): an AudioWorklet feeding `WindowChunker`, one inference per 1.5 s, pausing when hidden or idle.

Risks:

- **Licence** blocks any commercial path for v2.4, and the ShareAlike and notice duties apply to hosted copies of the weights.
- **Size:** 58 MB is heavy for phones on mobile data, and iOS can evict it from storage.
- **Drift:** TF.js float32 WebGL results can differ slightly from the TFLite results on the Space. Validate as in step 3.
- **Safari WebGL/OffscreenCanvas quirks** in workers. The WASM fallback covers this but is slower.
- **V3 churn:** labels and terms may change before release.

## 7. Built: on-device mode (2026-09-28)

**What the user sees.** Settings → Identifying → "Identify bird calls on this device" (off by default). Turning it on shows the download size, a Download button (the tap is the confirmation of the size; "Best on Wi-Fi"), progress with Cancel, then Remove. The BirdNET credit and a link to CC BY-NC-SA 4.0 sit under the control, and the privacy page says what's sent in each mode. Until the model is downloaded, or if it can't run, calls go to the Space as before.

**Where the files come from.** No hosting by us. The app downloads the BirdNET team's own TF.js build of v2.4 (the files BirdNET Live ships: `model.json` + 13 shards, `area-model/`, `labels/en_us.txt`) from **jsDelivr, pinned to commit `6ab67ac` of `birdnet-team/real-time-pwa`**. jsDelivr sends `Access-Control-Allow-Origin: *` and immutable caching. Every file is checked against a **SHA-256 in `src/features/listen/birdnet/manifest.ts`** before it's cached, so a changed or tampered upstream file is refused. If that source ever disappears, `node scripts/mirror-birdnet-model.mjs` copies the same files (with the licence and a README) to a public Hugging Face model repo and prints the `VITE_BIRDNET_MODEL_URL` to set; nothing else changes. Not verified: that these files are byte-identical to the Zenodo `BirdNET_v2.4_tfjs.zip` (not downloaded); the results below match the Space's Zenodo TFLite model, which is the check that matters.

**Caching.** Cache Storage bucket `fieldlens-birdnet-v2.4`, keyed under `/models/birdnet-v2.4/` on our own origin (so a change of source doesn't orphan a download). `LICENSE.txt` (credit, licence, citation, source, "no changes") is stored beside the weights, and `complete.json` is written last so a half-finished download is never used (and resumes: verified files aren't fetched again). `navigator.storage.persist()` is requested, and the download stops early if the storage estimate is too small. The service worker's precache never includes the model or the worker: `globIgnores` skips `birdnetWorker-*.js`, and a single `CacheFirst` runtime rule (`fieldlens-birdnet-runtime`) keeps the worker script and TF.js WASM for offline use once they've been fetched (the worker is started once right after the download for that reason). Remove deletes both caches.

**Runtime.** `@tensorflow/tfjs-core`, `-layers`, `-converter`, `-backend-webgl` and `-backend-wasm` 4.22.0 (new dependencies), used only inside `birdnetWorker.ts`. WebGL first, but only if the GPU can render float32 textures (half floats lose too much precision); WASM (SIMD) otherwise. The spectrogram layer (`MelSpecLayerSimple`) is our own code (`melSpec.ts`): Keras's layer takes the *real part* of the STFT (a complex → float cast), which is linear, so Hann window × real DFT × mel filterbank fold into one matrix and the whole layer becomes one strided `conv1d`. That runs on every backend without a custom FFT kernel. The acoustic model's last layer is a sigmoid (the TFLite export gives logits), so no extra sigmoid is applied. Windows are sent in batches of 4 (short batches zero-padded) so WebGL compiles one shape only; both models are warmed up on load, and Listen starts loading while the user records.

**Same processing as the Space.** `protocol.ts` reuses `frameWindows` (3 s, 1.5 s hop, padded tail, 1 s minimum) and `rankDetections` (mean ranking, best-window score, 0.03 location filter, noise classes held back), with the same week number, the same `k` (`CANDIDATES.maxCandidates`) and the same 30 s cap.

**How results reach the result screen (option (a) of step 5).** The phone sends BirdNET's result (`{model, seconds, results, sound}`, `shared/onDeviceCall.ts`, validated with zod) in a `birdnet` form field instead of the WAV, so the request is under 1 KB and the recording never leaves the phone. `/api/identify` turns it into the same candidates as a Space result (`OnDeviceBirdnetProvider`, sharing `toCallCandidates` and the confidence cap), then runs the usual enrichment: taxonomy, GBIF, eBird, ranges, facts. It doesn't need the Space to be configured. The attribution line says "identified on this device". Offline, the Listen screen shows the on-device name in its error message ("On this device it sounds like…"), since the full result still needs the server. Trust: the server takes the client's scores as given, which is no worse than today (a client could already send any audio).

**Verified.**

- Chrome (Playwright, `channel: chrome`, headless, macOS x86): download of all 18 files with checksums in about 5 s; load 0.2 s + warm-up 1.2–2.5 s (WebGL); a warm 15 s clip (9 windows) in **0.25–0.6 s** on WebGL and **about 1 s on WASM** (GPU disabled).
- Against the Space, same 15 s of audio, with and without location: Northern Cardinal, American Robin (New York, May), Great Tit, Eurasian Blackbird (London, April; Wikimedia Commons / xeno-canto recordings). **All 8 runs: identical species lists and order; every score and mean within 0.0001.** WASM results match WebGL to within 0.0001 too.
- Full Listen flow in dev (Chrome's fake microphone playing the Great Tit clip): the request carried only the `birdnet` field (853 bytes, no audio), and the result screen showed Great Tit.
- Unit tests (fake model, no downloads): `tests/unit/birdnetOnDevice.test.ts` (spectrogram kernel vs a direct DFT, worker protocol, batching, location cache, errors, client timeouts, form field, server parsing and pipeline), `tests/unit/birdnetModelStore.test.ts` (checksums, licence file, resume, remove), `tests/component/onDeviceCalls.test.tsx` (setting and credit).

**Bundle impact** (`vite build`): main `index` chunk 224.38 → 224.61 kB (+0.2 kB; +0.1 kB gzipped). Precache 1,184 → 1,196 KiB (Settings/Listen and the small model-store chunk). New lazy files, fetched only by people who turn it on: `birdnetWorker-*.js` 1.77 MB (285 kB gzipped), and the WASM binaries (311 kB and 425 kB; only fetched if WebGL isn't usable).

**Still to do.**

- Run the 40-clip set through both paths (plan step 3's bar: same top-1 on at least 39/40, scores within 0.02). The 4 clips above are a smoke test, not that check.
- Measure on a real mid-range Android (Chrome) and an iPhone 12-class device (Safari 26): load time, warm time per clip, memory, and whether Safari's worker WebGL passes the float32 check or falls back to WASM. Plan step 8's bar: a warm 10 s ID under 2 s.
- Labels are English (`en_us`) only, like the Space; the server's taxonomy supplies the displayed names anyway.
- "Clear local data" doesn't delete the model; Remove in Settings does.

## 8. 40-clip check against the Space (2026-09-29)

**Set.** 40 new research-grade iNaturalist bird recordings from 2024 on, one per species: 20 from North America, 20 from Europe, mostly phone clips (21 m4a, 16 wav, 3 mp3). Each clip went through the app's own `toCallSamples` (mono, 48 kHz, first 15 s). The phone path ran on those samples in headless Chrome (WebGL). The Space got `encodeWav` of the same samples. Both used the observation's location and date.

**Result: the same top-1 on 39/40.** Of the 37 clips with results on both sides, scores were within 0.01 on 35 and at most 0.024 on the other 2 (two clips had no bird above the threshold on either side); the small gap is the Space's 16-bit WAV against the phone's float samples. Against the observers' species, top-1 was 26/40 on the phone and 27/40 on the Space (top-3: 31 and 32). These clips often record a different bird from the one observed, which is why accuracy is lower than the curated set in DECISIONS.md.

**The one difference is the location model.** For the Tawny Owl (Cornwall, week 36), both paths score the owl 0.93 without location. The phone's location model gives *Strix aluco* 0.025, just under the 0.03 filter, so it's dropped. The Space's gives 0.030. The TF.js `area-model` shipped by BirdNET Live (converter v3.17, 6.8 MB) is an older location model than the one in v2.4's official release (`BirdNET_v2.4_tfjs.zip` → `model/mdata`, converter v4.16, 29 MB, same labels and `[lat, lon, week]` input). The Space's `meta-model.tflite` comes from that same release. At the same place and week the official model keeps 146 species against the old model's 112. BirdNET Live's repository hasn't changed its model since 6ab67ac.

**Fix (not done).** Load the official `mdata` model instead. That adds ~22 MB to the download (about 82 MB in total), and it has to be hosted somewhere the app can fetch it, since it's only published inside the Zenodo zip. `scripts/mirror-birdnet-model.mjs` could put it in our Hugging Face mirror.

## Sources

- BirdNET-Analyzer (code MIT, model licence and non-commercial note): https://github.com/birdnet-team/BirdNET-Analyzer
- BirdNET v2.4 model files and licence metadata: https://zenodo.org/records/15050749
- BirdNET Live PWA (TF.js, worker, service worker): https://github.com/birdnet-team/real-time-pwa · live at https://birdnet-team.github.io/real-time-pwa/
- BirdNET+ V3.0 developer preview (ONNX web demo, terms of use): https://github.com/birdnet-team/birdnet-V3.0-dev · models at https://zenodo.org/records/20703646
- georg95/birdnet-web (no licence file): https://github.com/georg95/birdnet-web
- Chirpity: https://github.com/Mattk70/Chirpity-Electron
- LiteRT.js: https://developers.google.com/edge/litert/web
- ONNX Runtime Web deployment and threading: https://onnxruntime.ai/docs/tutorials/web/deploy.html · https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html
- WebGPU in Safari 26: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- CC BY-NC-SA 4.0 legal code (NonCommercial definition): https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode
- Runtime file sizes measured from jsDelivr (`@tensorflow/tfjs@4.22.0`, `@tensorflow/tfjs-backend-wasm@4.22.0`, `onnxruntime-web@1.26.0`) on 2026-09-28.
