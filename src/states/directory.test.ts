import { afterEach, describe, expect, it, vi } from 'vitest';
import { STATES, type StateId, type StateInfo } from './registry';
import { DEFAULT_FILTER, areaBounds, clearDirectoryCache, filterAreas, loadStateDirectory, parseDirectory, sanitizeArea, typeCounts } from './directory';

const square = (x: number, y: number) => ({ type: 'Polygon', coordinates: [[[x, y], [x + 0.1, y], [x + 0.1, y + 0.1], [x, y + 0.1], [x, y]]] });
const feat = (props: Record<string, unknown>, geometry: unknown = square(-84, 34)) => ({ type: 'Feature', geometry, properties: { id: 'ga-x', state: 'GA', name: 'X WMA (GA)', land_type_std: 'State WMA / Wildlife Area', agency: 'GA DNR', acres: 1000, acres_verified: false, county_or_region: 'Rabun', notes: 'n', source_url: 'https://georgiawildlife.com/x', flags: [], geometry_source: 'PAD-US 4.0', match_confidence: 'high', ...props } });
const registry = (): Record<StateId, StateInfo> => ({ ...STATES, GA: { ...STATES.GA, dataFile: 'states/ga.geojson' } });
const okFetch = (body: unknown) => vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));

afterEach(() => clearDirectoryCache());

describe('directory feature checks', () => {
  it('keeps a well-formed feature', () => {
    const a = sanitizeArea(feat({}), 'GA')!;
    expect(a.properties).toMatchObject({ id: 'ga-x', state: 'GA', name: 'X WMA (GA)', acres: 1000, source_url: 'https://georgiawildlife.com/x', match_confidence: 'high' });
  });

  it('drops rows the rollout rules keep off the map, even if the file contains them', () => {
    for (const flag of ['aggregate_or_nontract', 'private_or_coop', 'maybe_not_deer']) expect(sanitizeArea(feat({ flags: ['rules_unverified', flag] }), 'GA')).toBeNull();
    expect(sanitizeArea(feat({ flags: 'acreage_missing;private_or_coop' }), 'GA')).toBeNull();
    expect(sanitizeArea(feat({ match_confidence: 'low' }), 'GA')).toBeNull();
    expect(sanitizeArea(feat({ match_confidence: undefined }), 'GA')).toBeNull();
    expect(sanitizeArea(feat({ state: 'TN' }), 'GA')).toBeNull();
    expect(sanitizeArea(feat({}, { type: 'Point', coordinates: [-84, 34] }), 'GA')).toBeNull();
    expect(sanitizeArea(feat({}, null), 'GA')).toBeNull();
    expect(sanitizeArea(feat({ name: '  ' }), 'GA')).toBeNull();
  });

  it('blanks values that are not what they claim to be, never inventing one', () => {
    const p = sanitizeArea(feat({ acres: '1,000', acres_verified: true, source_url: 'javascript:alert(1)', agency: '', notes: null, county_or_region: 7 }), 'GA')!.properties;
    expect(p.acres).toBeNull();
    expect(p.acres_verified).toBe(false); // nothing to verify without a number
    expect(p.source_url).toBeNull();
    expect(p.agency).toBeNull(); expect(p.notes).toBeNull(); expect(p.county_or_region).toBeNull();
    expect(sanitizeArea(feat({ acres: -5 }), 'GA')!.properties.acres).toBeNull();
    expect(sanitizeArea(feat({ acres: Number.NaN }), 'GA')!.properties.acres).toBeNull();
    expect(sanitizeArea(feat({ geometry_source: undefined }), 'GA')!.properties.geometry_source).toBe('not recorded');
  });

  it('parses a collection and drops duplicate ids', () => {
    const fc = parseDirectory({ type: 'FeatureCollection', features: [feat({}), feat({}), feat({ id: 'ga-y', flags: ['private_or_coop'] }), feat({ id: 'ga-z' })] }, 'GA');
    expect(fc.features.map((f) => f.properties.id)).toEqual(['ga-x', 'ga-z']);
    expect(() => parseDirectory({ nope: 1 }, 'GA')).toThrow(/FeatureCollection/);
  });
});

describe('directory loader', () => {
  it('fetches the state file lazily, once, from data/<dataFile>', async () => {
    const fetcher = okFetch({ type: 'FeatureCollection', features: [feat({})] });
    const a = await loadStateDirectory('GA', { registry: registry(), fetcher, base: '/' });
    const b = await loadStateDirectory('GA', { registry: registry(), fetcher, base: '/' });
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/data/states/ga.geojson');
    expect(a.features).toHaveLength(1);
  });

  it('refuses Alabama and states with no data without fetching', async () => {
    const fetcher = okFetch({});
    await expect(loadStateDirectory('AL', { fetcher })).rejects.toThrow(/no directory data/);
    await expect(loadStateDirectory('GA', { fetcher })).rejects.toThrow(/no directory data/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('a failed download is not cached, so a retry fetches again', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ type: 'FeatureCollection', features: [feat({})] }) });
    await expect(loadStateDirectory('GA', { registry: registry(), fetcher, base: '/' })).rejects.toThrow(/Georgia \(404\)/);
    await expect(loadStateDirectory('GA', { registry: registry(), fetcher, base: '/' })).resolves.toMatchObject({ features: [{ properties: { id: 'ga-x' } }] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('directory filters', () => {
  const fc = parseDirectory({ type: 'FeatureCollection', features: [
    feat({ id: 'a', name: 'Chattahoochee National Forest (GA)', land_type_std: 'National Forest', flags: ['acreage_usfs_official'] }),
    feat({ id: 'b', name: 'Rich Mountain WMA (GA)', flags: ['rules_unverified'] }),
    feat({ id: 'c', name: 'Allatoona WMA (GA)' }),
    feat({ id: 'd', name: 'Piedmont NWR (GA)', land_type_std: 'National Wildlife Refuge' }),
  ] }, 'GA');
  const ids = (f: Partial<typeof DEFAULT_FILTER>) => filterAreas(fc.features, { ...DEFAULT_FILTER, ...f }).map((a) => a.properties.id);

  it('filters by land_type_std, sorted by name', () => {
    expect(ids({})).toEqual(['c', 'a', 'd', 'b']);
    expect(ids({ type: 'State WMA / Wildlife Area' })).toEqual(['c', 'b']);
    expect(ids({ type: 'National Forest' })).toEqual(['a']);
  });
  it('searches by name, ignoring case and punctuation', () => {
    expect(ids({ query: 'rich mtn' })).toEqual([]);
    expect(ids({ query: 'RICH mountain' })).toEqual(['b']);
    expect(ids({ query: 'wma (ga' })).toEqual(['c', 'b']);
  });
  it('hide unverified removes rules_unverified areas', () => {
    expect(ids({ hideUnverified: true })).toEqual(['c', 'a', 'd']);
  });
  it('counts land types for the chips', () => {
    expect(typeCounts(fc.features)).toEqual([['State WMA / Wildlife Area', 2], ['National Forest', 1], ['National Wildlife Refuge', 1]]);
  });
  it('computes area bounds', () => {
    expect(areaBounds(fc.features[0])).toEqual([[-84, 34], [-83.9, 34.1]]);
  });
});
