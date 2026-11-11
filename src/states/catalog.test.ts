// scripts/lib/state-catalog.mjs: the pure half of scripts/build-state-catalog.mjs.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs build helper without type declarations
import { buildCatalog, coreName, exclusionReason, matchRow, normalizeName, parseCsv, reportMarkdown } from '../../scripts/lib/state-catalog.mjs';
import { parseDirectory } from './directory';

const HEADER = 'state,name,land_type_std,land_type,managing_agency,acreage,acreage_num,acreage_note,acreage_agent_value,county_or_region,deer_notes,source_url,flags';
const row = (o: Record<string, string>) => ({ state: 'GA', name: 'X', land_type_std: 'State WMA / Wildlife Area', land_type: 'WMA', managing_agency: 'GA DNR', acreage: '', acreage_num: '', acreage_note: '', acreage_agent_value: '', county_or_region: '', deer_notes: '', source_url: '', flags: '', ...o });
const poly = { type: 'Polygon', coordinates: [[[-84, 34], [-83.9, 34], [-83.9, 34.1], [-84, 34]]] };
const cand = (name: string, source = 'PAD-US 4.0') => ({ name, geometry: poly, source });

describe('CSV parsing', () => {
  it('handles quotes, doubled quotes, commas in fields and CRLF', () => {
    const rows = parseCsv(`${HEADER}\r\nGA,"Lake, ""The"" WMA (GA)",State WMA / Wildlife Area,WMA,GA DNR,"1,200",1200,,,"Hall, Dawson",note,https://x.gov,rules_unverified;acreage_missing\r\n`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Lake, "The" WMA (GA)', acreage: '1,200', county_or_region: 'Hall, Dawson', flags: 'rules_unverified;acreage_missing' });
  });
  it('rejects a row with the wrong number of fields', () => {
    expect(() => parseCsv(`${HEADER}\nGA,only,three`)).toThrow(/row 2/);
  });
  it('reads the real master CSV: 1,430 rows, 22 states, no Alabama', () => {
    const rows = parseCsv(readFileSync(new URL('../../research/states/public-land-master.csv', import.meta.url), 'utf8'));
    expect(rows).toHaveLength(1430);
    const states = new Set(rows.map((r: { state: string }) => r.state));
    expect(states.size).toBe(22);
    expect(states.has('AL')).toBe(false);
    expect(rows.filter((r: { state: string }) => r.state === 'GA')).toHaveLength(84);
  });
});

describe('name matching', () => {
  it('normalizes the state label, punctuation and abbreviations', () => {
    expect(normalizeName('Daniel Boone National Forest (KY)')).toBe('daniel boone national forest');
    expect(normalizeName("Rich Mtn. WMA (GA)")).toBe('rich mountain wildlife management area');
    expect(normalizeName('St. Marks NWR')).toBe('saint marks national wildlife refuge');
    expect(coreName('Rich Mountain WMA (GA)')).toBe('rich mountain');
    expect(normalizeName('B. F. GRANT WMA')).toBe(normalizeName('B.F. Grant WMA'));
    expect(normalizeName('J. L. Lester WMA')).toBe('jl lester wildlife management area');
    expect(normalizeName('A Big Tract')).toBe('a big tract');
  });
  it('a shorter boundary name inside the row name is only reported, never drawn', () => {
    const m = matchRow(row({ name: 'Hannahatchee Creek WMA' }), [cand('HANNAHATCHEE WMA')]);
    expect(m.confidence).toBe('low');
    expect(m.note).toContain('HANNAHATCHEE WMA');
  });
  it('high for the same name, medium for the same core name, never guesses', () => {
    expect(matchRow(row({ name: 'Rich Mountain WMA (GA)' }), [cand('Rich Mountain Wildlife Management Area')]).confidence).toBe('high');
    expect(matchRow(row({ name: 'Rich Mountain WMA (GA)' }), [cand('Rich Mountain')]).confidence).toBe('medium');
    expect(matchRow(row({ name: 'Rich Mountain WMA (GA)' }), [cand('Rich Mountain'), cand('Rich Mountain State Park')]).confidence).toBe('low');
    expect(matchRow(row({ name: 'Rich Mountain WMA (GA)' }), [cand('Rich Mountain WMA'), cand('Rich Mountain WMA')]).confidence).toBe('low');
    expect(matchRow(row({ name: 'Rich Mountain WMA (GA)' }), [cand('Big Rich Mountain Tract')]).confidence).toBe('low');
    expect(matchRow(row({ name: 'Rich Mountain WMA (GA)' }), [cand('Blue Ridge WMA')]).confidence).toBe('none');
  });
});

describe('catalog build', () => {
  const rows = [
    row({ name: 'Rich Mountain WMA (GA)', acreage_num: '6000', source_url: 'https://georgiawildlife.com/rich', flags: 'rules_unverified' }),
    row({ name: 'Chattahoochee National Forest (GA)', land_type_std: 'National Forest', acreage_num: '750000', flags: 'acreage_usfs_official' }),
    row({ name: 'Statewide WMA system (GA)', flags: 'aggregate_or_nontract' }),
    row({ name: 'Power Co Land (GA)', flags: 'private_or_coop' }),
    row({ name: 'Duck Marsh WMA (GA)', flags: 'maybe_not_deer' }),
    row({ name: 'Nowhere WMA (GA)', flags: 'acreage_missing' }),
    row({ name: 'Blue Ridge WMA (GA)' }),
    row({ state: 'TN', name: 'Rich Mountain WMA (TN)' }),
  ];
  const cands = [cand('Rich Mountain WMA'), cand('Chattahoochee National Forest', 'USFS EDW'), cand('Statewide WMA system'), cand('Power Co Land'), cand('Duck Marsh WMA'), cand('Blue Ridge'), cand('Blue Ridge State Park')];
  const out = buildCatalog('ga', rows, cands);

  it('applies the flag rules', () => {
    expect(exclusionReason(row({ flags: 'acreage_missing;aggregate_or_nontract' }))).toBe('aggregate_or_nontract');
    expect(exclusionReason(row({ flags: 'rules_unverified;source_wikipedia' }))).toBeNull();
    expect(out.excluded.map((x: { why: string }) => x.why)).toEqual(['aggregate_or_nontract', 'private_or_coop', 'maybe_not_deer']);
  });

  it('draws only high/medium matches, national forests first, with the documented properties', () => {
    expect(out.summary).toEqual({ rows: 7, matched: 2, excluded: 3, unmatched: 1, low: 1 });
    const [nf, wma] = out.fc.features;
    expect(nf.properties).toEqual({ id: 'ga-chattahoochee-national-forest', state: 'GA', name: 'Chattahoochee National Forest (GA)', land_type_std: 'National Forest', agency: 'GA DNR', acres: 750000, acres_verified: true, county_or_region: null, notes: null, source_url: null, flags: ['acreage_usfs_official'], geometry_source: 'USFS EDW', match_confidence: 'high' });
    expect(wma.properties).toMatchObject({ id: 'ga-rich-mountain-wildlife-management-area', acres: 6000, acres_verified: false, source_url: 'https://georgiawildlife.com/rich', flags: ['rules_unverified'], geometry_source: 'PAD-US 4.0', match_confidence: 'high' });
  });

  it('its output passes the app-side checks unchanged', () => {
    expect(parseDirectory(JSON.parse(JSON.stringify(out.fc)), 'GA').features).toHaveLength(2);
  });

  it('the report lists every row that needs the owner', () => {
    const md = reportMarkdown('GA', out, { date: '2026-11-09', sources: ['PAD-US 4.0 (padus.geojson)'] });
    expect(md).toContain('# GA directory build report');
    expect(md).toContain('Drawn on the map (high/medium match): 2');
    for (const name of ['Nowhere WMA (GA)', 'Blue Ridge WMA (GA)', 'Statewide WMA system (GA)', 'Power Co Land (GA)', 'Duck Marsh WMA (GA)']) expect(md).toContain(name);
    expect(md).toContain('2 boundaries share the core name "blue ridge"');
  });

  it('with no boundaries, nothing is drawn', () => {
    expect(buildCatalog('GA', rows, []).summary).toMatchObject({ matched: 0, unmatched: 4 });
  });
});
