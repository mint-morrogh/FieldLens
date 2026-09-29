/**
 * The BirdNET v2.4 TF.js files for identifying calls on the device, and where they come from.
 * See docs/research/birdnet-browser.md.
 *
 * Source: the BirdNET team's own browser build of v2.4 (the files BirdNET Live ships), served
 * by jsDelivr from a pinned commit of github.com/birdnet-team/real-time-pwa. jsDelivr sends
 * CORS headers and immutable caching, so nothing has to be hosted by FieldLens. Every file is
 * checked against the SHA-256 below before it's cached, so a changed upstream file is refused
 * rather than silently used. To serve a mirror instead (e.g. a Hugging Face model repo made
 * with scripts/mirror-birdnet-model.mjs), set VITE_BIRDNET_MODEL_URL to its base URL, with
 * the same layout and files.
 *
 * The files are kept in their own Cache Storage bucket (not the service worker's precache), so
 * only people who turn the feature on download them.
 */

export const BIRDNET_MODEL_VERSION = 'v2.4';

/** Pinned: github.com/birdnet-team/real-time-pwa at 6ab67ac (2025-12-15). */
const DEFAULT_SOURCE =
  'https://cdn.jsdelivr.net/gh/birdnet-team/real-time-pwa@6ab67ac09fa64d98858b90f14318229aca9bb7dc/public/models/birdnet/';

function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

/** Where the files are downloaded from. */
export const BIRDNET_SOURCE_URL = withSlash(
  (import.meta.env?.VITE_BIRDNET_MODEL_URL as string | undefined) || DEFAULT_SOURCE,
);

/** The dedicated Cache Storage bucket. A new model version gets a new bucket. */
export const BIRDNET_CACHE = `fieldlens-birdnet-${BIRDNET_MODEL_VERSION}`;

/** The service worker's runtime cache for the worker script and TF.js WASM (vite.config.ts). */
export const BIRDNET_RUNTIME_CACHE = 'fieldlens-birdnet-runtime';

/**
 * Cached files are stored under this same-origin path (whatever the download source), so a
 * change of source doesn't orphan a download. Nothing is ever served from it over the network:
 * the worker reads these keys straight from the cache.
 */
export const BIRDNET_CACHE_PATH = `/models/birdnet-${BIRDNET_MODEL_VERSION}/`;

export type ModelFile = { path: string; bytes: number; sha256: string };

/** Acoustic model (`model.json` + 13 shards), location model, English labels. */
export const BIRDNET_FILES: readonly ModelFile[] = (
  [
    ['model.json', 893632, 'cbc10d46bb3c5cac268e55ec3e1314cf520dfc0b15b626025cee941876d5e67a'],
    [
      'group1-shard1of13.bin',
      4194304,
      '62c6e6135f2925785b15c872715df29587471d0d91b8a75f2707754d2d41c41b',
    ],
    [
      'group1-shard2of13.bin',
      4194304,
      '2c7356997fb3c74954adde1648a1e650eefff0ee2f6dceeba0f388f5bfc3b99f',
    ],
    [
      'group1-shard3of13.bin',
      4194304,
      '9405b2e71b22f68536a5e3b04bc593790e4f959e3a88bb815c680f26360beb55',
    ],
    [
      'group1-shard4of13.bin',
      4194304,
      '0c0f88923dac0712e5d0bfee9f50474a344ca6b08e3dfd7ff27e3ef6716d1693',
    ],
    [
      'group1-shard5of13.bin',
      4194304,
      'f2f7acbf5cb470b9eb00d3de3f871143ac50f6aa3506a7e956bc91b7d91e48a9',
    ],
    [
      'group1-shard6of13.bin',
      4194304,
      '75782b73672c34a31cd111ce6816cab1ab6264e816c4baa15e811bce07bd7fe0',
    ],
    [
      'group1-shard7of13.bin',
      4194304,
      '0539c23ee436acbce0086e2fd40ed74f4f2f4fbdc262da5186e249f8e8b41afe',
    ],
    [
      'group1-shard8of13.bin',
      4194304,
      '7b4d62a8ba75ffa6c4327c8f9a9d06840f71e9bc52817cafe10ecbd57451cd02',
    ],
    [
      'group1-shard9of13.bin',
      4194304,
      '7e4720b896431303e5c6aa53744397a3c8ac3097c34a15d90ebe022d9e607a28',
    ],
    [
      'group1-shard10of13.bin',
      4194304,
      'cf1dce3898e96c422596d2e0f64490263bc8d6bcb6e14bfb63467200938f195f',
    ],
    [
      'group1-shard11of13.bin',
      4194304,
      '6601c211eb0de4b13773065759867c9e0948b87bdd2652fbff1d32ec8f3d30c5',
    ],
    [
      'group1-shard12of13.bin',
      4194304,
      '539c5bf4e5cad4e050ce06cc0b34f4f43d8f6729797823fe9dc7a8c6e2665511',
    ],
    [
      'group1-shard13of13.bin',
      990032,
      'cd39bf5e5520b2b5d52b27d8d19b313d78d6333d829afeb023b7308cb33e52fb',
    ],
    [
      'area-model/model.json',
      27328,
      '01872657918ff815cdd8b4477a8ef9990f7586346959fac2f2bf23feab28e32c',
    ],
    [
      'area-model/group1-shard1of2.bin',
      4194304,
      '6f4d51a0f0d37b334d683adb3f9ce428351878a65346b9dc70d769bf18590d4a',
    ],
    [
      'area-model/group1-shard2of2.bin',
      2864028,
      '938af90ceff896d8bd885061430916cf54900ff6b6d0de8c3e86d2dd3360abf2',
    ],
    [
      'labels/en_us.txt',
      259740,
      'b50b77b7c3dfe40cd637e8cccdca0173a0a4ddee8867b830ff3c1a566f477f16',
    ],
  ] as const
).map(([path, bytes, sha256]) => ({ path, bytes, sha256 }));

/** 59.6 MB in all. */
export const BIRDNET_TOTAL_BYTES = BIRDNET_FILES.reduce((n, f) => n + f.bytes, 0);

export const ACOUSTIC_MODEL = 'model.json';
export const LOCATION_MODEL = 'area-model/model.json';
export const LABELS_FILE = 'labels/en_us.txt';
/** Written last, so its presence means every file above is cached and verified. */
export const COMPLETE_MARKER = 'complete.json';
/** The licence notice stored next to the weights (CC BY-NC-SA asks for it to travel with them). */
export const LICENSE_FILE = 'LICENSE.txt';

export const BIRDNET_LICENSE = {
  name: 'CC BY-NC-SA 4.0',
  url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  credit:
    'BirdNET v2.4 by the K. Lisa Yang Center for Conservation Bioacoustics at the Cornell Lab of Ornithology and Chemnitz University of Technology',
  projectUrl: 'https://github.com/birdnet-team/BirdNET-Analyzer',
  modelRecordUrl: 'https://zenodo.org/records/15050749',
};

export const LICENSE_TEXT = `BirdNET v2.4 model files (acoustic model, location model, labels)

${BIRDNET_LICENSE.credit}.
Kahl, S., Wood, C. M., Eibl, M., & Klinck, H. (2021). BirdNET: A deep learning solution for
avian diversity monitoring. Ecological Informatics, 61, 101236.

Licence: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
(${BIRDNET_LICENSE.name}), ${BIRDNET_LICENSE.url}
The Zenodo record (${BIRDNET_LICENSE.modelRecordUrl}) lists CC BY-NC 4.0; the stricter
BY-NC-SA terms are followed here. Non-commercial use only.

Project: ${BIRDNET_LICENSE.projectUrl}
Files as published by the BirdNET team in BirdNET Live (github.com/birdnet-team/real-time-pwa,
commit 6ab67ac), downloaded from ${BIRDNET_SOURCE_URL}

Changes: none. The weights are used unmodified. FieldLens computes the model's spectrogram
layer (MelSpecLayerSimple) with its own code, which reads the layer's published parameters.
`;

/** Absolute cache key for a model file, on this origin. */
export function cacheKey(
  path: string,
  origin: string = globalThis.location?.origin ?? 'http://localhost',
): string {
  return new URL(BIRDNET_CACHE_PATH + path, origin).href;
}
