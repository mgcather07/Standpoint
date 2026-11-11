// Public Land Directory data: one GeoJSON per state (public/data/states/<st>.geojson), downloaded only when that
// state is chosen. The file is checked again here, not trusted: rows the rollout rules keep off the map are
// dropped even if the build script let them through, and values that are not what they claim to be become blank.
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { STATES, type StateId, type StateInfo } from './registry';

export type MatchConfidence = 'high' | 'medium' | 'low';

/** Feature properties written by scripts/build-state-catalog.mjs (docs/STATE_ROLLOUT.md, step 5). */
export interface AreaProps {
  id: string;
  state: StateId;
  name: string;
  land_type_std: string;
  agency: string | null;
  acres: number | null;
  acres_verified: boolean;
  county_or_region: string | null;
  notes: string | null;
  source_url: string | null;
  flags: string[];
  geometry_source: string;
  match_confidence: MatchConfidence;
}
export type DirectoryArea = Feature<Polygon | MultiPolygon, AreaProps>;
export type DirectoryFc = FeatureCollection<Polygon | MultiPolygon, AreaProps>;

/** Rows with these flags never reach the map. */
export const HIDDEN_FLAGS = ['aggregate_or_nontract', 'private_or_coop', 'maybe_not_deer'] as const;
const SHOWN: readonly string[] = ['high', 'medium'];

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const httpUrl = (v: unknown): string | null => { const s = str(v); return s && /^https?:\/\//i.test(s) ? s : null; };
const acres = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const flagList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? v.split(/[;|]/).map((x) => x.trim()).filter(Boolean) : []);

/** Clean one feature, or null when it must not be shown. */
export function sanitizeArea(f: unknown, state: StateId): DirectoryArea | null {
  const feat = f as Partial<Feature> | null;
  const g = feat?.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null;
  const p = (feat?.properties ?? {}) as Record<string, unknown>;
  const id = str(p.id), name = str(p.name), type = str(p.land_type_std), conf = str(p.match_confidence);
  if (!id || !name || !type || !conf || !SHOWN.includes(conf)) return null;
  if (str(p.state)?.toUpperCase() !== state) return null;
  const flags = flagList(p.flags);
  if (flags.some((x) => (HIDDEN_FLAGS as readonly string[]).includes(x))) return null;
  const a = acres(p.acres);
  return {
    type: 'Feature',
    geometry: g,
    properties: {
      id, state, name, land_type_std: type,
      agency: str(p.agency),
      acres: a,
      acres_verified: a != null && p.acres_verified === true,
      county_or_region: str(p.county_or_region),
      notes: str(p.notes),
      source_url: httpUrl(p.source_url),
      flags,
      geometry_source: str(p.geometry_source) ?? 'not recorded',
      match_confidence: conf as MatchConfidence,
    },
  };
}

export function parseDirectory(raw: unknown, state: StateId): DirectoryFc {
  const feats = (raw as { features?: unknown })?.features;
  if (!Array.isArray(feats)) throw new Error('Directory file is not a GeoJSON FeatureCollection');
  const seen = new Set<string>();
  const features: DirectoryArea[] = [];
  for (const f of feats) {
    const a = sanitizeArea(f, state);
    if (a && !seen.has(a.properties.id)) { seen.add(a.properties.id); features.push(a); }
  }
  return { type: 'FeatureCollection', features };
}

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
const cache = new Map<StateId, Promise<DirectoryFc>>();

/** One state's directory, fetched the first time it is asked for and kept for the session. */
export function loadStateDirectory(id: StateId, opts: { registry?: Record<StateId, StateInfo>; fetcher?: Fetcher; base?: string } = {}): Promise<DirectoryFc> {
  const s = (opts.registry ?? STATES)[id];
  if (!s || s.kind !== 'directory' || !s.dataFile) return Promise.reject(new Error(`${s?.name ?? id} has no directory data`));
  const hit = cache.get(id);
  if (hit) return hit;
  const fetcher = opts.fetcher ?? ((u: string) => fetch(u));
  const base = opts.base ?? import.meta.env?.BASE_URL ?? '/';
  const p = (async () => {
    const r = await fetcher(`${base}data/${s.dataFile}`);
    if (!r.ok) throw new Error(`Could not load ${s.name} (${r.status})`);
    return parseDirectory(await r.json(), id);
  })().catch((e) => { cache.delete(id); throw e; });
  cache.set(id, p);
  return p;
}
export const clearDirectoryCache = () => cache.clear();

export interface DirectoryFilter {
  /** land_type_std to show, or 'all'. */
  type: string;
  query: string;
  hideUnverified: boolean;
}
export const DEFAULT_FILTER: DirectoryFilter = { type: 'all', query: '', hideUnverified: false };

export const isUnverified = (p: AreaProps) => p.flags.includes('rules_unverified');
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Areas that pass the list/map filters, sorted by name. */
export function filterAreas(areas: DirectoryArea[], f: DirectoryFilter): DirectoryArea[] {
  const q = fold(f.query);
  return areas
    .filter((a) => (f.type === 'all' || a.properties.land_type_std === f.type) && (!f.hideUnverified || !isUnverified(a.properties)) && (!q || fold(a.properties.name).includes(q)))
    .sort((a, b) => a.properties.name.localeCompare(b.properties.name));
}

/** The land types present, with counts, most common first: the filter chips. */
export function typeCounts(areas: DirectoryArea[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const a of areas) m.set(a.properties.land_type_std, (m.get(a.properties.land_type_std) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Bounds of one area, for "show on map". */
export function areaBounds(a: DirectoryArea): [[number, number], [number, number]] {
  const rings = a.geometry.type === 'Polygon' ? a.geometry.coordinates : a.geometry.coordinates.flat();
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [[w, s], [e, n]];
}
