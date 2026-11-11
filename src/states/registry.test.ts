import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, STATES, STATE_IDS, STATE_STORAGE_KEY, hasData, isStateId, pickerStates, readStoredState, resolveState, stateBounds, writeStoredState, type StateId, type StateInfo } from './registry';
import { REGIONS } from '../engine/regions';

const withGa = (): Record<StateId, StateInfo> => ({ ...STATES, GA: { ...STATES.GA, dataFile: 'states/ga.geojson' } });
const memory = (init: Record<string, string> = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };

describe('state registry', () => {
  it('has Alabama plus the 22 researched states, each with a sane bbox and time zone', () => {
    expect(STATE_IDS).toHaveLength(23);
    expect(STATE_IDS[0]).toBe('AL');
    for (const id of STATE_IDS) {
      const s = STATES[id];
      expect(s.id).toBe(id);
      const [w, so, e, n] = s.bbox;
      expect(w).toBeLessThan(e); expect(so).toBeLessThan(n);
      expect(w).toBeGreaterThan(-95); expect(e).toBeLessThan(-66); expect(so).toBeGreaterThan(24); expect(n).toBeLessThan(48);
      expect(['America/New_York', 'America/Chicago']).toContain(s.tz);
    }
  });

  it('Alabama is the full-engine state made of the existing regions, unchanged', () => {
    const al = STATES.AL;
    expect(DEFAULT_STATE).toBe('AL');
    expect(al.kind).toBe('intelligence');
    expect(al.tz).toBe('America/Chicago');
    expect(al.dataFile).toBeNull();
    expect(al.regions).toEqual(['bankhead', 'choccolocco', 'hollins', 'oakmulgee']);
    // every Alabama region sits inside the state's box
    for (const r of Object.values(REGIONS)) { expect(r.bbox[0]).toBeGreaterThan(al.bbox[0]); expect(r.bbox[2]).toBeLessThan(al.bbox[2]); expect(r.bbox[1]).toBeGreaterThan(al.bbox[1]); expect(r.bbox[3]).toBeLessThan(al.bbox[3]); }
  });

  it('every other state is a directory state with no data until it is registered (Phase 0 starts no state)', () => {
    for (const id of STATE_IDS.filter((x) => x !== 'AL')) { expect(STATES[id].kind).toBe('directory'); expect(STATES[id].dataFile).toBeNull(); expect(hasData(STATES[id])).toBe(false); }
  });

  it('the picker lists only states with data, so today it is Alabama alone', () => {
    expect(pickerStates().map((s) => s.id)).toEqual(['AL']);
    expect(pickerStates(withGa()).map((s) => s.id)).toEqual(['AL', 'GA']);
  });

  it('resolves unknown or data-less states to Alabama', () => {
    expect(resolveState('GA').id).toBe('AL');
    expect(resolveState('GA', withGa()).id).toBe('GA');
    for (const bad of ['ZZ', 'ga', '', null, undefined, 42, {}, 'constructor', '__proto__']) expect(resolveState(bad).id).toBe('AL');
    expect(isStateId('constructor')).toBe(false);
  });

  it('remembers the choice in localStorage and never throws when storage is missing or broken', () => {
    const store = memory();
    expect(readStoredState(store)).toBe('AL');
    writeStoredState('GA', store);
    expect(store.m.get(STATE_STORAGE_KEY)).toBe('"GA"');
    expect(readStoredState(store)).toBe('AL'); // GA has no data yet
    expect(readStoredState(memory({ [STATE_STORAGE_KEY]: '"AL"' }))).toBe('AL');
    expect(readStoredState(memory({ [STATE_STORAGE_KEY]: '{not json' }))).toBe('AL');
    expect(readStoredState(null)).toBe('AL');
    const throwing = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(readStoredState(throwing)).toBe('AL');
    expect(() => writeStoredState('AL', throwing)).not.toThrow();
  });

  it('gives MapLibre bounds from the bbox', () => {
    expect(stateBounds(STATES.GA)).toEqual([[-85.61, 30.36], [-80.84, 35.0]]);
  });
});
