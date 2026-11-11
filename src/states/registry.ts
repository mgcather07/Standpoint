// States the app knows about. Alabama is the reference implementation: its areas are the hand-built regions in
// engine/regions.ts with full terrain, scoring and verified regulations, and nothing here changes how they work.
// Every other state is a Public Land Directory (docs/STATE_ROLLOUT.md, Layer A): polygons and info cards only,
// no scoring and no legal verdicts. A state appears in the picker once its dataFile is set (build it with
// scripts/build-state-catalog.mjs, review the report, then set dataFile here).
import { REGIONS, type RegionId } from '../engine/regions';

export type StateId =
  | 'AL' | 'GA' | 'TN' | 'MS' | 'FL' | 'KY' | 'NC' | 'SC' | 'VA' | 'WV' | 'OH' | 'PA'
  | 'LA' | 'NY' | 'MD' | 'NJ' | 'DE' | 'CT' | 'MA' | 'RI' | 'VT' | 'NH' | 'ME';

export type Bbox = [number, number, number, number];

export interface StateInfo {
  id: StateId;
  name: string;
  /** [west, south, east, north]: what the map fits to when the state is chosen. */
  bbox: Bbox;
  /** IANA time zone covering most of the state. Informational for directory states; not used by the engine. */
  tz: string;
  /** True where part of the state uses another time zone. */
  tzSplit?: boolean;
  /** Directory file under the site's data/ folder (states/<st>.geojson), or null while the state has no data. */
  dataFile: string | null;
  /** 'intelligence' = full engine (Alabama only); 'directory' = map polygons and info cards. */
  kind: 'intelligence' | 'directory';
  /** Alabama only: the engine regions this state is made of. */
  regions?: RegionId[];
}

const dir = (id: StateId, name: string, bbox: Bbox, tz: string, tzSplit = false): StateInfo => ({ id, name, bbox, tz, ...(tzSplit ? { tzSplit } : {}), dataFile: null, kind: 'directory' });
const NY_TZ = 'America/New_York', CHI_TZ = 'America/Chicago';

export const STATES: Record<StateId, StateInfo> = {
  AL: { id: 'AL', name: 'Alabama', bbox: [-88.47, 30.14, -84.89, 35.01], tz: CHI_TZ, dataFile: null, kind: 'intelligence', regions: Object.keys(REGIONS) as RegionId[] },
  // rollout order (docs/STATE_ROLLOUT.md tracker): neighbors first
  GA: { ...dir('GA', 'Georgia', [-85.61, 30.36, -80.84, 35.0], NY_TZ), dataFile: 'states/ga.geojson' }, // 2026-11-10: research/states/reports/GA.md
  TN: dir('TN', 'Tennessee', [-90.31, 34.98, -81.65, 36.68], CHI_TZ, true),
  MS: dir('MS', 'Mississippi', [-91.66, 30.17, -88.1, 35.0], CHI_TZ),
  FL: dir('FL', 'Florida', [-87.63, 24.4, -79.97, 31.0], NY_TZ, true),
  KY: dir('KY', 'Kentucky', [-89.57, 36.5, -81.96, 39.15], NY_TZ, true),
  NC: dir('NC', 'North Carolina', [-84.32, 33.84, -75.46, 36.59], NY_TZ),
  SC: dir('SC', 'South Carolina', [-83.35, 32.03, -78.54, 35.22], NY_TZ),
  VA: dir('VA', 'Virginia', [-83.68, 36.54, -75.24, 39.47], NY_TZ),
  WV: dir('WV', 'West Virginia', [-82.64, 37.2, -77.72, 40.64], NY_TZ),
  OH: dir('OH', 'Ohio', [-84.82, 38.4, -80.52, 41.98], NY_TZ),
  PA: dir('PA', 'Pennsylvania', [-80.52, 39.72, -74.69, 42.27], NY_TZ),
  LA: dir('LA', 'Louisiana', [-94.04, 28.93, -88.82, 33.02], CHI_TZ),
  NY: dir('NY', 'New York', [-79.76, 40.5, -71.86, 45.02], NY_TZ),
  MD: dir('MD', 'Maryland', [-79.49, 37.91, -75.05, 39.72], NY_TZ),
  NJ: dir('NJ', 'New Jersey', [-75.56, 38.93, -73.89, 41.36], NY_TZ),
  DE: dir('DE', 'Delaware', [-75.79, 38.45, -75.05, 39.84], NY_TZ),
  CT: dir('CT', 'Connecticut', [-73.73, 40.98, -71.79, 42.05], NY_TZ),
  MA: dir('MA', 'Massachusetts', [-73.51, 41.24, -69.93, 42.89], NY_TZ),
  RI: dir('RI', 'Rhode Island', [-71.86, 41.15, -71.12, 42.02], NY_TZ),
  VT: dir('VT', 'Vermont', [-73.44, 42.73, -71.46, 45.02], NY_TZ),
  NH: dir('NH', 'New Hampshire', [-72.56, 42.7, -70.61, 45.31], NY_TZ),
  ME: dir('ME', 'Maine', [-71.08, 43.06, -66.95, 47.46], NY_TZ),
};

export const DEFAULT_STATE: StateId = 'AL';
export const STATE_IDS = Object.keys(STATES) as StateId[];
export const isStateId = (x: unknown): x is StateId => typeof x === 'string' && Object.hasOwn(STATES, x);

/** A state can be chosen when it has data: Alabama always, a directory state once its file is registered. */
export const hasData = (s: StateInfo) => s.kind === 'intelligence' || !!s.dataFile;

/** States shown in the picker. States without data are hidden (owner's decision, 2026-11-09). */
export function pickerStates(registry: Record<StateId, StateInfo> = STATES): StateInfo[] {
  return STATE_IDS.map((id) => registry[id]).filter(hasData);
}

/** A stored or requested state, falling back to Alabama when it is unknown or has no data. */
export function resolveState(id: unknown, registry: Record<StateId, StateInfo> = STATES): StateInfo {
  return isStateId(id) && hasData(registry[id]) ? registry[id] : registry[DEFAULT_STATE];
}

export const STATE_STORAGE_KEY = 'sp.state.v1';

/** The remembered state. Storage can be missing or throw (private mode, blocked site data), so this never fails. */
export function readStoredState(storage: Pick<Storage, 'getItem'> | null | undefined = globalThis.localStorage): StateId {
  try { return resolveState(JSON.parse(storage?.getItem(STATE_STORAGE_KEY) ?? 'null')).id; } catch { return DEFAULT_STATE; }
}
export function writeStoredState(id: StateId, storage: Pick<Storage, 'setItem'> | null | undefined = globalThis.localStorage): void {
  try { storage?.setItem(STATE_STORAGE_KEY, JSON.stringify(id)); } catch { /* private mode */ }
}

/** MapLibre bounds for a state. */
export const stateBounds = (s: StateInfo): [[number, number], [number, number]] => [[s.bbox[0], s.bbox[1]], [s.bbox[2], s.bbox[3]]];
