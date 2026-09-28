import { cellToParent, gridDisk, latLngToCell } from 'h3-js';
import type { ApproxLocation, RangeStatus } from '../../../shared/types.js';
import { UpstreamError } from '../../lib/errors.js';
import { USER_AGENT } from '../../lib/http.js';
import { TIMEOUTS_MS } from '../../../shared/config.js';
import type { RangeProvider } from '../types.js';

export const RANGES_SOURCE = 'iNaturalist Open Range Map Dataset';
export const RANGES_ATTRIBUTION = {
  provider: RANGES_SOURCE,
  text: 'Species ranges from the iNaturalist Open Range Map Dataset (CC BY 4.0)',
  url: 'https://www.inaturalist.org/pages/range_maps',
};

/** Ranges are stored as H3 cells of this resolution (~26 km edge), sharded by a coarser parent. */
export const RANGE_RESOLUTION = 4;
const SHARD_RESOLUTION = 2;
/** Shards change monthly; keep them for a day per server instance. */
const TTL_MS = 24 * 60 * 60 * 1000;

type Loaded<T> = { at: number; value: Promise<T> };

/** Decodes a shard: [u64 LE cell][u32 LE count][count LEB128 varints, delta-encoded ids]… */
export function decodeShard(bytes: Uint8Array, wanted: Set<string>): Map<string, Set<number>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map<string, Set<number>>();
  let pos = 0;
  while (pos + 12 <= bytes.length) {
    const cell = view.getBigUint64(pos, true).toString(16);
    const count = view.getUint32(pos + 8, true);
    pos += 12;
    const keep = wanted.has(cell);
    const ids = keep ? new Set<number>() : undefined;
    let id = 0;
    for (let i = 0; i < count; i++) {
      let value = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = bytes[pos++];
        value += (byte & 0x7f) * 2 ** shift;
        shift += 7;
      } while (byte & 0x80);
      id += value;
      ids?.add(id);
    }
    if (ids) out.set(cell, ids);
  }
  return out;
}

/**
 * Whether species are expected at a location, from iNaturalist's modelled range maps
 * hosted in our Hugging Face dataset repo. "near" means within one cell (~50 km) of the
 * range. Species without a range map are left out of the answer.
 */
export class HuggingFaceRangeProvider implements RangeProvider {
  readonly name = RANGES_SOURCE;
  private readonly files = new Map<string, Loaded<unknown>>();

  constructor(
    private readonly repo: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private load<T>(path: string, parse: (r: Response) => Promise<T>, missing: T): Promise<T> {
    const hit = this.files.get(path);
    if (hit && this.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
    const value = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUTS_MS.supporting);
      try {
        const res = await this.fetchImpl(
          `https://huggingface.co/datasets/${this.repo}/resolve/main/${path}`,
          {
            signal: controller.signal,
            headers: { Authorization: `Bearer ${this.token}`, 'User-Agent': USER_AGENT },
          },
        );
        if (res.status === 404) return missing;
        if (!res.ok) throw new UpstreamError(RANGES_SOURCE, 'http', res.status);
        return await parse(res);
      } catch (error) {
        if (error instanceof UpstreamError) throw error;
        throw new UpstreamError(RANGES_SOURCE, controller.signal.aborted ? 'timeout' : 'network');
      } finally {
        clearTimeout(timer);
      }
    })();
    this.files.set(path, { at: this.now(), value });
    // Don't keep failures around.
    value.catch(() => this.files.delete(path));
    return value;
  }

  private taxonIds(names: string[]): Promise<Map<string, number>> {
    const prefixes = [
      ...new Set(names.map((n) => n.slice(0, 2)).filter((p) => /^[a-z]{2}$/.test(p))),
    ];
    return Promise.all(
      prefixes.map((p) => this.load<Record<string, number>>(`taxa/${p}.json`, (r) => r.json(), {})),
    ).then((maps) => {
      const ids = new Map<string, number>();
      for (const name of names) {
        const id = maps[prefixes.indexOf(name.slice(0, 2))]?.[name];
        if (id !== undefined) ids.set(name, id);
      }
      return ids;
    });
  }

  async getRangeStatus(
    scientificNames: string[],
    location: ApproxLocation,
  ): Promise<Map<string, RangeStatus>> {
    const names = [...new Set(scientificNames.map((n) => n.trim().toLowerCase()))];
    const here = latLngToCell(location.latitude, location.longitude, RANGE_RESOLUTION);
    const ring = gridDisk(here, 1).filter((c) => c !== here);
    const wanted = new Set([here, ...ring]);
    const shardIds = [...new Set([...wanted].map((c) => cellToParent(c, SHARD_RESOLUTION)))];
    const [ids, ...shards] = await Promise.all([
      this.taxonIds(names),
      ...shardIds.map((s) =>
        this.load(
          `shards/${s}.bin`,
          async (r) => new Uint8Array(await r.arrayBuffer()),
          new Uint8Array(),
        ),
      ),
    ]);
    const cells = new Map<string, Set<number>>();
    for (const shard of shards)
      for (const [c, set] of decodeShard(shard, wanted)) cells.set(c, set);

    const status = new Map<string, RangeStatus>();
    for (const [name, id] of ids) {
      status.set(
        name,
        cells.get(here)?.has(id) ? 'in' : ring.some((c) => cells.get(c)?.has(id)) ? 'near' : 'out',
      );
    }
    return status;
  }
}
