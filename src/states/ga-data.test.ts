// The shipped Georgia directory file obeys the rollout rules (docs/STATE_ROLLOUT.md): only high/medium matches,
// no excluded or hidden flags, every card carries the confirm line, and nothing is filled that the CSV lacks.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STATES } from './registry';
import { HIDDEN_FLAGS, parseDirectory } from './directory';
import { CONFIRM_LINE, NO_ACREAGE, areaCard } from './display';
// @ts-expect-error plain .mjs helper without types
import { parseCsv } from '../../scripts/lib/state-catalog.mjs';

const raw = JSON.parse(readFileSync(new URL('../../public/data/states/ga.geojson', import.meta.url), 'utf8'));
const csv: Record<string, string>[] = parseCsv(readFileSync(new URL('../../research/states/public-land-master.csv', import.meta.url), 'utf8')).filter((r: Record<string, string>) => r.state === 'GA');

describe('Georgia directory data', () => {
  it('is registered and every feature survives the loader checks', () => {
    expect(STATES.GA.dataFile).toBe('states/ga.geojson');
    const fc = parseDirectory(raw, 'GA');
    expect(fc.features.length).toBe(raw.features.length);
    expect(fc.features.length).toBe(70);
  });

  it('draws only high or medium matches, with a recorded source and no hidden flags', () => {
    for (const f of raw.features) {
      const p = f.properties;
      expect(['high', 'medium']).toContain(p.match_confidence);
      expect(p.geometry_source).toMatch(/Georgia DNR|PAD-US/);
      expect(p.flags.some((x: string) => HIDDEN_FLAGS.includes(x))).toBe(false);
      expect(p.flags).not.toContain('aggregate_or_nontract');
      expect(p.flags).not.toContain('private_or_coop');
    }
  });

  it('carries the CSV values unchanged: blank stays blank, no acreage invented', () => {
    for (const f of raw.features) {
      const p = f.properties;
      const row = csv.find((r) => r.name === p.name);
      expect(row, p.name).toBeTruthy();
      expect(p.acres).toBe(row!.acreage_num ? Number(row!.acreage_num) : null);
      expect(p.source_url).toBe(row!.source_url || null);
      expect(p.notes).toBe(row!.deer_notes || null);
    }
    const grant = parseDirectory(raw, 'GA').features.find((f) => f.properties.name === 'B.F. Grant WMA')!;
    expect(areaCard(grant.properties).rows.find((r) => r.label === 'Size')!.value).toBe(NO_ACREAGE);
  });

  it('every card has the confirm line and no verdict words', () => {
    for (const f of parseDirectory(raw, 'GA').features) {
      const c = areaCard(f.properties);
      expect(c.confirm).toBe(CONFIRM_LINE);
      const text = [c.title, c.type, ...c.rows.map((r) => `${r.label} ${r.value}`), ...c.badges.map((b) => b.label), c.link?.label ?? '', c.provenance].join(' ');
      expect(text).not.toMatch(/\blegal\b|\bopen\b|\ballowed\b|\bpermitted\b|in season/i);
    }
  });
});
