#!/usr/bin/env python3
"""Build a compact "is taxon X expected in this H3 cell?" index from the
iNaturalist Open Range Map Dataset (iNat Geomodel, CC BY 4.0).

Requirements (Python >= 3.10):
    pip install "h3>=4,<5" "shapely>=2" "numpy>=1.24" certifi
  (certifi is optional; it supplies CA roots for Pythons without system certificates)

Usage (monthly, when iNaturalist publishes a new version; takes ~70 min, downloads ~8 GB):
    python scripts/build-range-shards.py --out /tmp/ranges --work /tmp/ranges-work --clean
    node scripts/upload-ranges.mjs /tmp/ranges     # to the private HF dataset RANGES_DATASET

    python build-range-shards.py [--out DIR] [--work DIR] [--version latest]
                                 [--fallback-version 2.32 | --fallback-version none]
                                 [--workers N] [--clean]

Source: https://inaturalist-open-data.s3.amazonaws.com/geomodel/geopackages/<version>/
  metadata.json, taxonomy.csv and iNaturalist_geomodel_<Group>[_<n>].gpkg (~4 GB/version).
  Each range is a MultiPolygon that is a union of H3 resolution-4 cells, split at the
  antimeridian, with rings around a pole closed along latitude +-90.

Cell membership: a res-4 cell is in a range iff a ray from its centre due south to the
South Pole crosses the range boundary an odd number of times, XOR the South Pole itself is
in the range (decided from the polygon part owning the southernmost boundary edge). Synthetic edges (the +-90 pole closures, and the vertical cuts along +-180,
which a meridian ray cannot cross) are ignored, and edges that wrap across +-180 are split.
For ordinary ranges this equals planar centre-in-polygon (checked on all 1,675 non-polar
mammal ranges); unlike planar tests or h3.polygon_to_cells it is also correct for polar
and near-global ranges, which the export encodes as pole-closed polygons.

Known data defect (versions 2.29, 2.33, 2.34 at least): when a range's main polygon
crosses the antimeridian (e.g. Holarctic ranges through Chukotka/Alaska) the export
sometimes drops that polygon entirely; e.g. Vulpes vulpes in 2.34 has no Europe or
North America, Sciurus vulgaris no Europe. With --fallback-version (default 2.32), a
taxon whose range touches the antimeridian (in either version) and whose latest range has
< 50% of the fallback's cells is taken from the fallback version instead. Repairs are
listed in repaired.json.

Output (in --out, default: directory of this script):
  shards/{res2_cell_hex}.bin   one file per H3 res-2 parent cell. Sequence of records,
                               sorted by cell index, one per non-empty res-4 child:
                                 uint64 LE  res-4 H3 index
                                 uint32 LE  N
                                 N x unsigned LEB128 varint: sorted taxon ids,
                                             delta-encoded (first value absolute)
  taxa.json                    {lower-cased scientific name: iNat taxon id}, species rank
  taxa/{xx}.json               same map, sharded by the first two chars of the name
  repaired.json                taxa replaced from the fallback version
  meta.json                    version, licence, citation, counts, sizes

Shards contain every modelled range (including the ~9k leaf ranges above species rank,
e.g. genera with no modelled species); taxa.json only names species-rank taxa.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import shutil
import sqlite3
import struct
import sys
import time
import urllib.request
from multiprocessing import Pool

import h3
import numpy as np
import shapely
from shapely import wkb

BASE = "https://inaturalist-open-data.s3.amazonaws.com/geomodel/geopackages"
H3_RES = 4
SHARD_RES = 2
SPECIES_RANK_LEVEL = 10
EPS = 1e-9
REPAIR_RATIO = 0.5

# ---------------------------------------------------------------- download ---

def fetch(url: str, dest: str) -> str:
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return dest
    tmp = dest + ".part"
    print(f"  downloading {url}", flush=True)
    try:
        import certifi, ssl
        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ctx = None
    with urllib.request.urlopen(url, context=ctx) as r, open(tmp, "wb") as f:
        shutil.copyfileobj(r, f, 1 << 20)
    os.replace(tmp, dest)
    return dest


def group_files(meta: dict) -> list[str]:
    names = []
    for group, info in meta["collections"].items():
        n = info["archives"]
        names += [f"iNaturalist_geomodel_{group}{'_' + str(i + 1) if n > 1 else ''}.gpkg" for i in range(n)]
    return names

# ------------------------------------------------------------ cell geometry ---

SX: np.ndarray   # cell-centre longitudes, sorted ascending
SY: np.ndarray   # matching latitudes
ORD: np.ndarray  # SX[i] belongs to cell index ORD[i] (index into the sorted cell array)


def all_res4_cells() -> np.ndarray:
    cells = [h3.str_to_int(c) for r0 in h3.get_res0_cells() for c in h3.cell_to_children(r0, H3_RES)]
    return np.array(sorted(cells), dtype=np.uint64)


def init_worker(cells: np.ndarray) -> None:
    global SX, SY, ORD
    ll = np.array([h3.cell_to_latlng(h3.int_to_str(int(c))) for c in cells])
    ORD = np.argsort(ll[:, 1], kind="stable")
    SX, SY = ll[ORD, 1].copy(), ll[ORD, 0].copy()


def gpkg_geom(blob: bytes):
    """Strip the GeoPackage binary header and parse the WKB body."""
    env = (blob[3] >> 1) & 7
    return wkb.loads(bytes(blob[8 + {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[env]:]))


def boundary_segments(g) -> np.ndarray:
    segs = []
    for ring in shapely.get_rings(shapely.get_parts(g)):
        c = shapely.get_coordinates(ring)
        if len(c) > 1:
            segs.append(np.hstack([c[:-1], c[1:]]))
    if not segs:  # empty geometry
        return np.empty((0, 4))
    s = np.vstack(segs)
    s = s[~((np.abs(s[:, 1]) >= 90 - EPS) & (np.abs(s[:, 3]) >= 90 - EPS))]  # pole closures
    wrap = np.abs(s[:, 2] - s[:, 0]) > 180
    if wrap.any():  # edge crossing the antimeridian: split it at +-180
        x1, y1, x2, y2 = s[wrap].T
        x2s = np.where(x2 < x1, x2 + 360, x2 - 360)
        edge = np.where(x2s > x1, 180.0, -180.0)
        ym = y1 + (edge - x1) / (x2s - x1) * (y2 - y1)
        s = np.vstack([s[~wrap], np.column_stack([x1, y1, edge, ym]), np.column_stack([-edge, ym, x2, y2])])
    return s


def range_cells(args) -> tuple[int, np.ndarray, bool]:
    """(taxon_id, sorted indices into the cell array, range touches the antimeridian)."""
    taxon_id, blob = args
    if blob is None:
        return taxon_id, np.empty(0, np.uint32), False
    g = gpkg_geom(blob)
    coords = shapely.get_coordinates(g)
    touches_am = bool(np.any((np.abs(coords[:, 0]) >= 180 - EPS) & (np.abs(coords[:, 1]) < 90 - EPS)))
    x1, y1, x2, y2 = boundary_segments(g).T
    lo, hi = np.minimum(x1, x2), np.maximum(x1, x2)
    a = np.searchsorted(SX, lo, "left")
    n = np.searchsorted(SX, hi, "left") - a  # centres with lo <= x < hi
    total = int(n.sum())
    if total == 0:
        return taxon_id, np.empty(0, np.uint32), touches_am
    seg = np.repeat(np.arange(n.size), n)
    idx = np.arange(total) - np.repeat(np.cumsum(n) - n, n) + a[seg]
    y_at = y1[seg] + (SX[idx] - x1[seg]) / (x2[seg] - x1[seg]) * (y2[seg] - y1[seg])
    parity = np.bincount(idx[y_at < SY[idx]], minlength=SX.size) & 1
    if south_pole_inside(g):
        parity ^= 1
    return taxon_id, np.sort(ORD[parity.astype(bool)]).astype(np.uint32), touches_am


PROBE_LNG = 0.0123456789  # a meridian that never coincides with an H3 vertex


def south_pole_inside(g) -> bool:
    """Is the South Pole inside the range? Find the southernmost real boundary edge on the
    probe meridian; the polygon part that owns it is planar-correct next to its own edges,
    so test a point just south of that edge against that part only."""
    best_y, best_part = None, None
    for part in shapely.get_parts(g):
        s = boundary_segments(part)
        if not s.size:
            continue
        x1, y1, x2, y2 = s.T
        hit = (np.minimum(x1, x2) <= PROBE_LNG) & (PROBE_LNG < np.maximum(x1, x2))
        if not hit.any():
            continue
        y = y1[hit] + (PROBE_LNG - x1[hit]) / (x2[hit] - x1[hit]) * (y2[hit] - y1[hit])
        if best_y is None or y.min() < best_y:
            best_y, best_part = float(y.min()), part
    if best_part is None:  # no boundary on the probe meridian: pole shares the meridian's status
        return bool(shapely.contains_xy(g, PROBE_LNG, 0.0))
    return bool(shapely.contains_xy(best_part, PROBE_LNG, max(best_y - 1e-6, -90 + 1e-7)))

# ------------------------------------------------------------------ helpers ---

def res2_parent(cells: np.ndarray) -> np.ndarray:
    """Vectorised h3 cell_to_parent(cell, 2) for res-4 cells (bit manipulation)."""
    res_mask = np.uint64(0xF) << np.uint64(52)
    digits_3_4 = np.uint64(0b111111) << np.uint64(33)  # digits 3 and 4 -> 7 (unused)
    return (cells & ~res_mask) | (np.uint64(SHARD_RES) << np.uint64(52)) | digits_3_4


def leb128_deltas(ids: np.ndarray) -> bytes:
    out = bytearray()
    prev = 0
    for t in ids.tolist():
        d = t - prev
        prev = t
        while d >= 0x80:
            out.append((d & 0x7F) | 0x80)
            d >>= 7
        out.append(d)
    return bytes(out)


def iter_version(pool, src: str, gdir: str, only):
    """Yield (file name, [(taxon_id, name, rank, cells, touches_am), ...]) group by group."""
    meta = json.load(open(fetch(f"{src}/metadata.json", os.path.join(gdir, "metadata.json"))))
    for fname in group_files(meta):
        if only and fname not in only:
            continue
        path = fetch(f"{src}/{fname}", os.path.join(gdir, fname))
        db = sqlite3.connect(path, check_same_thread=False)  # the Pool feeder thread reads the cursor
        table = db.execute("select table_name from gpkg_contents where data_type='features'").fetchone()[0]
        info = {tid: (name, rank) for tid, name, rank in db.execute(f"select taxon_id, name, rank from {table}")}
        res = [(tid, *info[tid], cells, am) for tid, cells, am in
               pool.imap_unordered(range_cells, db.execute(f"select taxon_id, geom from {table}"), chunksize=4)]
        db.close()
        yield fname, res

# --------------------------------------------------------------------- main ---

def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=here)
    ap.add_argument("--work", default=os.path.join(here, "..", "work"))
    ap.add_argument("--version", default="latest")
    ap.add_argument("--fallback-version", default="2.32", help="'none' to disable antimeridian repair")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    ap.add_argument("--only", nargs="*", help="restrict to these geopackage file names (testing)")
    ap.add_argument("--clean", action="store_true", help="delete downloads and temp files afterwards")
    a = ap.parse_args()

    t0 = time.time()
    src = f"{BASE}/{a.version}"
    gdir = os.path.join(a.work, "gpkg", a.version)
    tdir, fbdir = os.path.join(a.work, "pairs"), os.path.join(a.work, "fallback")
    for d in (gdir, tdir, fbdir):
        shutil.rmtree(d, ignore_errors=True) if d != gdir else None
        os.makedirs(d, exist_ok=True)
    meta = json.load(open(fetch(f"{src}/metadata.json", os.path.join(gdir, "metadata.json"))))
    taxonomy_path = fetch(f"{src}/taxonomy.csv", os.path.join(gdir, "taxonomy.csv"))
    rank_level = {int(r["taxon_id"]): float(r["rank_level"] or 99) for r in csv.DictReader(open(taxonomy_path))}
    print(f"Geomodel {meta['version']}: {meta['ranges']} ranges", flush=True)

    cells = all_res4_cells()
    shard_of = res2_parent(cells)
    for i in (0, 12345, len(cells) - 1):
        assert h3.cell_to_parent(h3.int_to_str(int(cells[i])), SHARD_RES) == h3.int_to_str(int(shard_of[i]))
    shard_ids, shard_idx = np.unique(shard_of, return_inverse=True)

    names: dict[str, tuple[tuple[int, int], int]] = {}
    seen: set[int] = set()
    repaired = []
    n_ranges = n_pairs = dupes = 0
    with Pool(a.workers, initializer=init_worker, initargs=(cells,)) as pool:
        # Pass 1: fallback version -> one .npy of cell indices per taxon (temp).
        fb_version = None
        fb_am: set[int] = set()
        if a.fallback_version.lower() != "none":
            fsrc = f"{BASE}/{a.fallback_version}"
            fgdir = os.path.join(a.work, "gpkg", a.fallback_version)
            os.makedirs(fgdir, exist_ok=True)
            fb_version = json.load(open(fetch(f"{fsrc}/metadata.json", os.path.join(fgdir, "metadata.json"))))["version"]
            kept = 0
            for fname, res in iter_version(pool, fsrc, fgdir, a.only):
                for tid, _, _, cs, am in res:
                    np.save(os.path.join(fbdir, f"{tid}.npy"), cs)
                    kept += 1
                    if am:
                        fb_am.add(tid)
                if a.clean:
                    os.remove(os.path.join(fgdir, fname))
                print(f"  fallback {fb_version} {fname}: {len(res)} ranges", flush=True)
            print(f"fallback {fb_version}: {kept} ranges, {len(fb_am)} touch the antimeridian", flush=True)

        # Pass 2: latest version -> per-shard temp files (8 bytes per (cell, taxon) pair).
        for fname, res in iter_version(pool, src, gdir, a.only):
            tg = time.time()
            cell_parts, tax_parts = [], []
            for tid, name, rank, cs, am in res:
                fb = os.path.join(fbdir, f"{tid}.npy")
                if (am or tid in fb_am) and os.path.exists(fb):
                    old = np.load(fb)
                    if cs.size < REPAIR_RATIO * old.size:
                        repaired.append({"taxon_id": tid, "name": name, "latest_cells": int(cs.size),
                                         "fallback_cells": int(old.size)})
                        cs = old
                if tid in seen:
                    print(f"  warning: taxon {tid} appears twice; merging", flush=True)
                seen.add(tid)
                n_ranges += 1
                cell_parts.append(cs)
                tax_parts.append(np.full(cs.size, tid, dtype=np.uint32))
                if rank_level.get(tid, 99) <= SPECIES_RANK_LEVEL and name:
                    key = name.strip().lower()
                    prio = (0 if rank == "species" else 1, tid)
                    if key in names:
                        dupes += 1
                        if prio >= names[key][0]:
                            continue
                    names[key] = (prio, tid)
            ci = np.concatenate(cell_parts) if cell_parts else np.empty(0, np.uint32)
            tx = np.concatenate(tax_parts) if tax_parts else np.empty(0, np.uint32)
            n_pairs += ci.size
            sh = shard_idx[ci]
            order = np.argsort(sh, kind="stable")
            sh, ci, tx = sh[order], ci[order], tx[order]
            if ci.size:
                bounds = np.flatnonzero(np.diff(sh)) + 1
                for s, e in zip(np.r_[0, bounds], np.r_[bounds, ci.size]):
                    rec = np.empty(e - s, dtype=[("c", "<u4"), ("t", "<u4")])
                    rec["c"], rec["t"] = ci[s:e], tx[s:e]
                    with open(os.path.join(tdir, f"{int(sh[s])}.bin"), "ab") as f:
                        rec.tofile(f)
            if a.clean:
                os.remove(os.path.join(gdir, fname))
            print(f"  {fname}: {len(res)} ranges, {ci.size:,} pairs, {time.time() - tg:.0f}s", flush=True)

    # Final shards.
    sdir = os.path.join(a.out, "shards")
    shutil.rmtree(sdir, ignore_errors=True)
    os.makedirs(sdir)
    total = largest = n_shards = n_cells = 0
    largest_name = ""
    for f in sorted(os.listdir(tdir)):
        rec = np.unique(np.fromfile(os.path.join(tdir, f), dtype=[("c", "<u4"), ("t", "<u4")]))
        c, t = rec["c"], rec["t"]  # sorted by (cell index, taxon); cell index order == H3 index order
        bounds = np.flatnonzero(np.diff(c)) + 1
        buf = bytearray()
        for cc, tt in zip(np.split(c, bounds), np.split(t, bounds)):
            buf += struct.pack("<QI", int(cells[cc[0]]), tt.size)
            buf += leb128_deltas(tt)
            n_cells += 1
        name = h3.int_to_str(int(shard_ids[int(f[:-4])]))
        with open(os.path.join(sdir, f"{name}.bin"), "wb") as out:
            out.write(buf)
        n_shards += 1
        total += len(buf)
        if len(buf) > largest:
            largest, largest_name = len(buf), name

    # Name maps.
    taxa = {k: v[1] for k, v in sorted(names.items())}
    with open(os.path.join(a.out, "taxa.json"), "w") as f:
        json.dump(taxa, f, separators=(",", ":"))
    tx_dir = os.path.join(a.out, "taxa")
    shutil.rmtree(tx_dir, ignore_errors=True)
    os.makedirs(tx_dir)
    by_prefix: dict[str, dict[str, int]] = {}
    for k, v in taxa.items():
        by_prefix.setdefault(k[:2], {})[k] = v
    for p, m in by_prefix.items():
        with open(os.path.join(tx_dir, f"{p}.json"), "w") as f:
            json.dump(m, f, separators=(",", ":"))
    with open(os.path.join(a.out, "repaired.json"), "w") as f:
        json.dump(sorted(repaired, key=lambda r: r["taxon_id"]), f, indent=0)

    now = dt.datetime.now(dt.timezone.utc)
    meta_out = {
        "version": meta["version"],
        "generatedAt": now.isoformat(timespec="seconds"),
        "source": f"{src}/",
        "sourcePage": "https://www.inaturalist.org/pages/range_maps",
        "licence": "CC BY 4.0",
        "citation": (f"iNaturalist. ({now.year}). iNaturalist Open Range Map Dataset {meta['version']}. "
                     f"Available at: https://www.inaturalist.org. Accessed {now:%B} {now.day}, {now.year}."),
        "h3Resolution": H3_RES,
        "shardResolution": SHARD_RES,
        "taxa": len(taxa),
        "ranges": n_ranges,
        "shards": n_shards,
        "cells": n_cells,
        "pairs": int(n_pairs),
        "totalBytes": total,
        "largestShard": {"cell": largest_name, "bytes": largest},
        "nameShards": len(by_prefix),
        "duplicateNamesResolved": dupes,
        "fallbackVersion": fb_version,
        "repairedFromFallback": len(repaired),
        "format": "shards/{res2}.bin: records sorted by cell: u64le res4 cell, u32le N, "
                  "N LEB128 delta-coded sorted taxon ids (first absolute)",
    }
    with open(os.path.join(a.out, "meta.json"), "w") as f:
        json.dump(meta_out, f, indent=2)
    print(json.dumps(meta_out, indent=2))

    if a.clean:
        shutil.rmtree(a.work, ignore_errors=True)
    print(f"done in {(time.time() - t0) / 60:.1f} min", file=sys.stderr)


if __name__ == "__main__":
    main()
