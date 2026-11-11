// The fast time helpers must give exactly what the original Intl-per-call versions gave, at every instant,
// including the hours around daylight-saving changes.
import { describe, expect, it } from 'vitest';
import * as SunCalc from 'suncalc';
import { chicagoParts, chicagoTime, fmtDate, fmtTime, sunDay, tzOffsetMinutes } from './time';

const refFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
function refParts(t: number) {
  const p = Object.fromEntries(refFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: p.weekday };
}
function refOffset(t: number) {
  const p = refParts(t); const [y, m, d] = p.date.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d, p.hour, p.minute) - Math.floor(t / 60000) * 60000) / 60000);
}
function refChicagoTime(date: string, hour = 0, minute = 0) {
  const [y, m, d] = date.split('-').map(Number); const guess = Date.UTC(y, m - 1, d, hour, minute);
  let t = guess - refOffset(guess) * 60000; t = guess - refOffset(t) * 60000; return t;
}

describe('fast Chicago time helpers match Intl exactly', () => {
  it('every 7 minutes (plus odd seconds) across both 2026 DST changes and a full year', () => {
    const spans: Array<[number, number, number]> = [
      [Date.UTC(2026, 2, 7), Date.UTC(2026, 2, 10), 7 * 60000 + 13000], // spring forward 2026-03-08
      [Date.UTC(2026, 9, 31), Date.UTC(2026, 10, 3), 7 * 60000 + 29000], // fall back 2026-11-01
      [Date.UTC(2025, 0, 1), Date.UTC(2028, 0, 1), 3 * 3600000 + 7 * 60000 + 1000],
    ];
    for (const [a, b, step] of spans) for (let t = a; t < b; t += step) {
      expect(chicagoParts(t)).toEqual(refParts(t));
      expect(chicagoParts(new Date(t))).toEqual(refParts(t));
      expect(tzOffsetMinutes(t)).toBe(refOffset(t));
    }
  });
  it('wall-clock conversion, including the skipped and repeated hours', () => {
    for (const date of ['2026-03-08', '2026-11-01', '2026-11-10', '2027-01-15', '2026-07-04']) for (let h = 0; h < 24; h++) for (const m of [0, 30, 59]) expect(chicagoTime(date, h, m)).toBe(refChicagoTime(date, h, m));
  });
  it('formatting is unchanged', () => {
    const t = Date.UTC(2026, 10, 10, 12, 5);
    expect(fmtTime(t)).toBe(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(t)));
    expect(fmtTime(null)).toBe('—');
    expect(fmtDate('2026-11-10')).toBe('Tuesday, November 10, 2026');
    expect(fmtDate('2026-11-10', { month: 'short', day: 'numeric' })).toBe('Nov 10');
  });
});

describe('sunDay', () => {
  it('gives the same values as computing them directly, moon included, and caches them', () => {
    const [lon, lat] = [-87.37, 34.23];
    const d = sunDay('2026-11-10', lon, lat);
    const noon = new Date(chicagoTime('2026-11-10', 12));
    const s = SunCalc.getTimes(noon, lat, lon);
    expect(d.sunrise).toBe(s.sunrise!.getTime());
    expect(d.legalEnd).toBe(s.sunset!.getTime() + 30 * 60000);
    const mi = SunCalc.getMoonIllumination(noon);
    const mt = SunCalc.getMoonTimes(new Date(chicagoTime('2026-11-10', 0)), lat, lon);
    expect(d.moon).toEqual({ phase: mi.phase, phaseName: expect.any(String), illumination: mi.fraction, rise: mt.rise?.getTime() ?? null, set: mt.set?.getTime() ?? null });
    expect(sunDay('2026-11-10', lon, lat)).toBe(d);
    expect(Object.isFrozen(d)).toBe(true);
    expect(Object.keys(d)).toContain('moon');
  });
});

describe('hoursBetween', () => {
  it('returns exactly what filtering would, sorted or not', async () => {
    const { hoursBetween } = await import('./weather');
    const H = 3600000, t0 = Date.UTC(2026, 10, 10);
    const hourly = Array.from({ length: 168 }, (_, i) => ({ time: t0 + i * H })) as never[];
    const ref = (a: Array<{ time: number }>, s: number, e: number) => a.filter((h) => h.time >= s - 30 * 60000 && h.time <= e);
    for (const [s, e] of [[t0 - 5 * H, t0 + 3 * H], [t0 + 10.4 * H, t0 + 14.6 * H], [t0 + 30 * 60000, t0 + H], [t0 + 200 * H, t0 + 300 * H], [t0 + 5 * H, t0 + 4 * H]]) {
      expect(hoursBetween({ hourly } as never, s, e)).toEqual(ref(hourly, s, e));
      const shuffled = [...hourly].reverse();
      expect(hoursBetween({ hourly: shuffled } as never, s, e)).toEqual(ref(shuffled, s, e));
    }
    expect(hoursBetween(null, 0, 1)).toEqual([]);
  });
});
