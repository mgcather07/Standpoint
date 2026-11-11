// Loads precomputed geographic intelligence (static files on Firebase Hosting; cached offline by the service worker).
import type { FeatureCollection, LineString, MultiLineString, MultiPolygon, Point, Polygon } from 'geojson';
import type { Candidate, CandidateProps } from './engine/types';
import { wmaZoneAt, type Layers } from './engine/geography';
import { loadGrid, type TerrainGrid } from './engine/spot';
import { REGIONS, type Region, type RegionId } from './engine/regions';

export interface SourceEntry {
  id: string;
  agency: string;
  title: string;
  url: string;
  coverage?: string;
  updated?: string | null;
  retrieved?: string | null;
  resolution?: string;
  usage?: string;
  quality: string;
  featureCount?: number;
  checksum?: string;
  error?: string;
}

export interface SourceRegistry {
  generated: string;
  terrain: { algorithmVersion: string; generated: string; parameters: Record<string, number>; counts: Record<string, unknown>; grid: { approxCellM: number[] } };
  sources: SourceEntry[];
}

export interface AppData extends Layers {
  candidates: Candidate[];
  candidatesFc: FeatureCollection<Polygon | MultiPolygon, CandidateProps>;
  accessPoints: FeatureCollection<Point>;
  checkStations: FeatureCollection<Point>;
  recSites: FeatureCollection<Point>;
  fsRoads: FeatureCollection<LineString | MultiLineString>;
  trails: FeatureCollection<LineString | MultiLineString>;
  /** Map-only layers drawn straight from their files by MapLibre's worker (never parsed on the main thread). */
  mapFiles: MapFiles;
  fuelTreatments: FeatureCollection<Polygon | MultiPolygon>;
  osmRoads: FeatureCollection<LineString | MultiLineString>;
  zoneD: FeatureCollection<Polygon | MultiPolygon>;
  zoneDLines: FeatureCollection<LineString | MultiLineString>;
  counties: FeatureCollection<Polygon | MultiPolygon>;
  water: FeatureCollection<Polygon | MultiPolygon>;
  registry: SourceRegistry;
  region: Region;
  wmaZones: NonNullable<Layers['wmaZones']>;
}

async function j<T>(file: string): Promise<T> {
  const r = await fetch(url(file));
  if (!r.ok) throw new Error(`Failed to load ${file} (${r.status})`);
  return r.json() as Promise<T>;
}

const EMPTY = { type: 'FeatureCollection', features: [] } as const;
/** Fired on window once an area's data has loaded (the service worker waits for it before precaching). */
export const DATA_READY_EVENT = 'standpoint:data-ready';
const url = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;

/** Display-only line layers (contours, streams), as URLs; the club's are added when your land's data is loaded. */
export interface MapFiles { contours: string; streams: string; club: { contours: string; streams: string } | null }
const cache = new Map<RegionId, Promise<AppData>>();

/** One region's data pack (Bankhead at the top of data/, the Talladega WMAs in data/<id>/). Cached per session. */
export function loadData(id: RegionId = 'bankhead'): Promise<AppData> {
  if (!cache.has(id)) {
    const p = loadRegion(REGIONS[id]);
    cache.set(id, p.catch((e) => { cache.delete(id); throw e; }));
    p.then(() => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_READY_EVENT)); }, () => undefined);
  }
  return cache.get(id)!;
}

async function loadRegion(region: Region): Promise<AppData> {
  const d = region.dir;
  // Bankhead-only layers (statewide deer-zone line, counties) and per-WMA zone maps are optional
  const opt = <T>(file: string) => j<T>(`${d}${file}`).catch(() => EMPTY as unknown as T);
  const [wmaZones, wma, nfAdmin, ownership, wilderness, highways, candidatesFc, accessPoints, checkStations, recSites, fsRoads, trails, registry, fuelTreatments, osmRoads, zoneD, zoneDLines, counties, water] = await Promise.all([
    opt<AppData['wmaZones']>('wma-zones.geojson'),
    j<Layers['wma']>(`${d}wma.geojson`),
    j<Layers['nfAdmin']>(`${d}nf-admin.geojson`),
    j<Layers['ownership']>(`${d}ownership.geojson`),
    j<Layers['wilderness']>(`${d}wilderness.geojson`),
    j<Layers['highways']>(`${d}highways.geojson`),
    j<AppData['candidatesFc']>(`${d}candidates.geojson`),
    j<AppData['accessPoints']>(`${d}access-points.geojson`),
    j<AppData['checkStations']>(`${d}check-stations.geojson`),
    j<AppData['recSites']>(`${d}rec-sites.geojson`),
    j<AppData['fsRoads']>(`${d}fs-roads.geojson`),
    j<AppData['trails']>(`${d}trails.geojson`),
    j<SourceRegistry>(`${d}sources.json`),
    j<AppData['fuelTreatments']>(`${d}fuel-treatments.geojson`),
    j<AppData['osmRoads']>(`${d}roads-osm.geojson`),
    opt<AppData['zoneD']>('deer-zone-d.geojson'),
    opt<AppData['zoneDLines']>('deer-zone-boundary.geojson'),
    opt<AppData['counties']>('counties.geojson'),
    opt<AppData['water']>('water-osm.geojson'),
  ]);
  // Talladega WMAs: each zone's A/B comes from the zone map traced off the permit (null near the line)
  if (region.wmaId && wmaZones.features.length) for (const f of candidatesFc.features) {
    const z = wmaZoneAt(wmaZones, f.properties.center);
    Object.assign(f.properties, { zone: z.zone, provisionalZone: z.provisional, distToZoneDivider: z.dist });
  }
  const candidates: Candidate[] = candidatesFc.features.map((f) => ({ geometry: f.geometry, properties: f.properties }));
  return { wma, nfAdmin, ownership, wilderness, highways, candidates, candidatesFc, accessPoints, checkStations, recSites, fsRoads, trails, mapFiles: { contours: url(`${d}contours.geojson`), streams: url(`${d}streams.geojson`), club: null }, registry, fuelTreatments, osmRoads, zoneD, zoneDLines, counties, water, region, wmaZones };
}

/** Public terrain, roads, streams and contours for the private-club box. Contains nothing that locates the club inside it. */
export interface ClubData {
  grid: TerrainGrid;
  roads: FeatureCollection<LineString | MultiLineString>;
  /** Contours and streams are map-only and drawn from their files. */
  mapFiles: { contours: string; streams: string };
}

export async function loadClubData(): Promise<ClubData> {
  const [grid, roads] = await Promise.all([loadGrid('club'), j<ClubData['roads']>('club/roads.geojson')]);
  return { grid, roads, mapFiles: { contours: url('club/contours.geojson'), streams: url('club/streams.geojson') } };
}
