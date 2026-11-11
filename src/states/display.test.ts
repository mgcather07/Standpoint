import { describe, expect, it } from 'vitest';
import type { AreaProps } from './directory';
import { CONFIRM_LINE, NO_ACREAGE, acreageText, areaCard, areaSubtitle } from './display';

const props = (p: Partial<AreaProps> = {}): AreaProps => ({ id: 'ky-dbnf', state: 'KY', name: 'Daniel Boone National Forest (KY)', land_type_std: 'National Forest', agency: 'USDA Forest Service', acres: 708000, acres_verified: false, county_or_region: 'Eastern KY', notes: 'Statewide seasons apply.', source_url: 'https://www.fs.usda.gov/dbnf', flags: [], geometry_source: 'USFS EDW', match_confidence: 'high', ...p });
const allText = (p: AreaProps) => { const c = areaCard(p); return [c.title, c.type, ...c.badges.map((b) => b.label), ...c.rows.flatMap((r) => [r.label, r.value]), c.notesLabel, c.link?.label ?? '', c.confirm, c.provenance].join(' \n '); };

describe('area card display rules', () => {
  it('always carries the confirm-with-the-agency line and the area link', () => {
    const c = areaCard(props());
    expect(c.confirm).toBe('Confirm seasons, permits and boundaries with the managing agency before you hunt.');
    expect(CONFIRM_LINE).toBe(c.confirm);
    expect(c.link).toEqual({ href: 'https://www.fs.usda.gov/dbnf', label: 'Agency page for this area' });
  });

  it('never gives a verdict: no "legal" and no "open" anywhere the app writes', () => {
    const variants = [props(), props({ flags: ['rules_unverified', 'overlaps_national_forest', 'source_wikipedia', 'source_homepage_or_blank'] }), props({ acres: null, agency: null, source_url: null, notes: null }), props({ acres_verified: true })];
    for (const p of variants) {
      const text = allText({ ...p, notes: null, name: 'Area' });
      expect(text).not.toMatch(/\blegal/i);
      expect(text).not.toMatch(/\bopen\b/i);
      expect(text).not.toMatch(/\b(allowed|permitted|in season)\b/i);
    }
  });

  it('keeps the state label on forest names', () => {
    expect(areaCard(props()).title).toBe('Daniel Boone National Forest (KY)');
  });

  it('blank stays blank: no acreage, agency, county or link is filled in', () => {
    const c = areaCard(props({ acres: null, agency: null, county_or_region: null, source_url: null, notes: null }));
    expect(c.rows).toEqual([{ label: 'Type', value: 'National Forest' }, { label: 'Size', value: NO_ACREAGE }]);
    expect(c.notes).toBeNull();
    expect(c.link).toBeNull();
    expect(areaSubtitle(props({ acres: null }))).toBe('National Forest · acreage not listed');
  });

  it('labels where an acreage came from, without changing it', () => {
    expect(acreageText(props({ acres: 576068, acres_verified: true }))).toBe('576,068 acres (USFS Land Area Report)');
    expect(acreageText(props({ acres: 22928, flags: ['source_wikipedia'] }))).toBe('22,928 acres (from Wikipedia, not agency-confirmed)');
    expect(acreageText(props({ acres: 1234.4 }))).toBe('1,234 acres (research figure, not agency-confirmed)');
    expect(acreageText(props({ acres: null, flags: ['acreage_missing'] }))).toBe(NO_ACREAGE);
  });

  it('badges unverified rules and national-forest overlap', () => {
    expect(areaCard(props({ flags: ['rules_unverified'] })).badges.map((b) => b.id)).toEqual(['unverified']);
    expect(areaCard(props({ flags: ['overlaps_national_forest'] })).badges.map((b) => b.id)).toEqual(['overlaps_nf']);
    expect(areaCard(props()).badges).toEqual([]);
  });

  it('says when the only link is an agency homepage, and labels notes as unverified research', () => {
    const c = areaCard(props({ flags: ['source_homepage_or_blank'] }));
    expect(c.link?.label).toBe('Agency website');
    expect(c.notesLabel).toMatch(/not verified/);
    expect(c.notes).toBe('Statewide seasons apply.');
    expect(c.provenance).toBe('Boundary: USFS EDW (high name match).');
  });
});
