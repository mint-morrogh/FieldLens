import { geoGraticule10, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import type { ApproxLocation, SpeciesDistribution } from '../../../shared/types';
import { ISO2_TO_NUMERIC } from './isoCountries';

type CountryFeature = GeoJSON.Feature<GeoJSON.Geometry, { name: string }> & { id?: string };

const topology = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const COUNTRIES = (
  feature(topology, topology.objects.countries) as unknown as GeoJSON.FeatureCollection<
    GeoJSON.Geometry,
    { name: string }
  >
).features as CountryFeature[];
const GRATICULE = geoGraticule10();
const SIZE = 280;
const DEG_PER_SECOND = 8;

/** 5-step moss scale from light to dark; index by log(count). */
const SHADES = ['#cfe3c2', '#a9cd96', '#7fb26a', '#4f8a44', '#2f5d3a'];

function shadeFor(count: number, max: number): string {
  if (count <= 0) return 'var(--globe-land)';
  const t = Math.log10(count + 1) / Math.log10(max + 1);
  return SHADES[Math.min(SHADES.length - 1, Math.floor(t * SHADES.length))];
}

/**
 * Slowly spinning orthographic globe with countries shaded by GBIF record counts.
 * Drag to rotate; respects prefers-reduced-motion (then it stays still).
 */
export type GlobePin = { latitude: number; longitude: number; count: number };

export default function Globe({
  distribution,
  userLocation,
  pins,
  title,
}: {
  /** Countries shaded by record count (species pages). */
  distribution?: SpeciesDistribution;
  userLocation?: ApproxLocation;
  /** Places to mark, e.g. where the journal's finds were made. */
  pins?: GlobePin[];
  title: string;
}) {
  const counts = useMemo(() => {
    const byNumeric = new Map<string, number>();
    for (const c of distribution?.countries ?? []) {
      const n = ISO2_TO_NUMERIC[c.code];
      if (n) byNumeric.set(n, (byNumeric.get(n) ?? 0) + c.count);
    }
    return byNumeric;
  }, [distribution]);
  const max = Math.max(1, ...counts.values());

  // Start facing the user, or the country with the most records.
  const start = useMemo<[number, number]>(() => {
    const focus = userLocation ?? pins?.[0];
    if (focus) return [-focus.longitude, -focus.latitude * 0.6];
    const topId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const top = COUNTRIES.find((c) => c.id === topId);
    if (top) {
      const [lng, lat] = geoPath().centroid(top as GeoPermissibleObjects);
      if (Number.isFinite(lng)) return [-lng, -lat * 0.6];
    }
    return [0, -20];
  }, [counts, userLocation, pins]);

  const [rotation, setRotation] = useState<[number, number]>(start);
  const dragging = useRef<{ x: number; y: number; r: [number, number] } | null>(null);
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reducedMotion) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!dragging.current && document.visibilityState === 'visible') {
        setRotation(([lng, lat]) => [lng + DEG_PER_SECOND * dt, lat]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reducedMotion]);

  const projection = geoOrthographic()
    .scale(SIZE / 2 - 4)
    .translate([SIZE / 2, SIZE / 2])
    .rotate([rotation[0], rotation[1]])
    .clipAngle(90);
  const path = geoPath(projection);
  const marker = userLocation ? projection([userLocation.longitude, userLocation.latitude]) : null;
  const markerVisible =
    userLocation &&
    marker &&
    // Only draw the marker on the visible hemisphere.
    path({ type: 'Point', coordinates: [userLocation.longitude, userLocation.latitude] }) !== null;

  const recorded = distribution?.countries.length ?? 0;
  const topNames = (distribution?.countries ?? [])
    .slice(0, 3)
    .map((c) => {
      const n = ISO2_TO_NUMERIC[c.code];
      return COUNTRIES.find((f) => f.id === n)?.properties.name ?? c.code;
    })
    .join(', ');

  return (
    <figure className="flex flex-col items-center" data-testid="globe">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-auto w-full max-w-[18rem] touch-none select-none"
        role="img"
        aria-label={
          distribution
            ? `Globe showing where ${title} has been recorded: ${recorded} countries, most in ${topNames}.`
            : `Globe showing ${title}: ${pins?.length ?? 0} places.`
        }
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          dragging.current = { x: e.clientX, y: e.clientY, r: rotation };
        }}
        onPointerMove={(e) => {
          const d = dragging.current;
          if (!d) return;
          const k = 180 / SIZE;
          setRotation([
            d.r[0] + (e.clientX - d.x) * k,
            Math.max(-80, Math.min(80, d.r[1] - (e.clientY - d.y) * k)),
          ]);
        }}
        onPointerUp={() => (dragging.current = null)}
        onPointerCancel={() => (dragging.current = null)}
      >
        <defs>
          <radialGradient id="globe-shine" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.08" />
          </radialGradient>
        </defs>
        <path
          d={path({ type: 'Sphere' }) ?? ''}
          fill="var(--globe-ocean)"
          stroke="var(--globe-edge)"
          strokeWidth={1}
        />
        <path d={path(GRATICULE) ?? ''} fill="none" stroke="var(--globe-grid)" strokeWidth={0.5} />
        {COUNTRIES.map((c, i) => (
          <path
            key={c.id ?? i}
            d={path(c as GeoPermissibleObjects) ?? ''}
            fill={shadeFor(counts.get(c.id ?? '') ?? 0, max)}
            stroke="var(--globe-border)"
            strokeWidth={0.4}
          >
            <title>
              {c.properties.name}
              {counts.get(c.id ?? '')
                ? `: ${counts.get(c.id ?? '')!.toLocaleString('en-US')} records`
                : ''}
            </title>
          </path>
        ))}
        {pins?.map((pin) => {
          const coordinates: [number, number] = [pin.longitude, pin.latitude];
          const xy = projection(coordinates);
          if (!xy || path({ type: 'Point', coordinates }) === null) return null;
          const r = 3 + Math.min(4, Math.log2(pin.count));
          return (
            <g key={`${pin.latitude},${pin.longitude}`} data-testid="globe-pin">
              <circle cx={xy[0]} cy={xy[1]} r={r + 4} fill="#9fd08a" opacity={0.3} />
              <circle cx={xy[0]} cy={xy[1]} r={r} fill="#4f8a44" stroke="#fff" strokeWidth={1.2} />
            </g>
          );
        })}
        {markerVisible && marker && (
          <g>
            <circle cx={marker[0]} cy={marker[1]} r={7} fill="#8f3a24" opacity={0.25} />
            <circle
              cx={marker[0]}
              cy={marker[1]}
              r={3.5}
              fill="#8f3a24"
              stroke="#fff"
              strokeWidth={1.2}
            />
          </g>
        )}
        <path d={path({ type: 'Sphere' }) ?? ''} fill="url(#globe-shine)" pointerEvents="none" />
      </svg>
      {distribution ? (
        <figcaption className="mt-2 w-full text-center text-sm text-ink-muted">
          Recorded in {recorded.toLocaleString('en-US')} {recorded === 1 ? 'country' : 'countries'}{' '}
          · {distribution.total.toLocaleString('en-US')} records
          {userLocation ? ' · red dot = you' : ''}
          <span className="mt-1 flex items-center justify-center gap-1" aria-hidden>
            <span>fewer</span>
            {SHADES.map((s) => (
              <span
                key={s}
                className="inline-block h-2.5 w-4 rounded-sm"
                style={{ background: s }}
              />
            ))}
            <span>more</span>
          </span>
        </figcaption>
      ) : null}
    </figure>
  );
}
