import * as SunCalc from 'suncalc';

export const TZ = 'America/Chicago';
export const BANKHEAD_CENTER: [number, number] = [-87.37, 34.23]; // centre of Bankhead National Forest

const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const HOUR_MS = 3600000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The engine converts times thousands of times per scoring pass, and Intl formatting is slow (milliseconds per call
// on a phone). Chicago's offset only changes at DST transitions, which fall exactly on UTC hour boundaries
// (2:00 CST = 08:00 UTC, 2:00 CDT = 07:00 UTC), so it is looked up once per UTC hour and cached.
const offsetCache = new Map<number, number>();
function offsetForHour(hourIndex: number): number {
  let off = offsetCache.get(hourIndex);
  if (off === undefined) {
    const t = hourIndex * HOUR_MS;
    const p = Object.fromEntries(partsFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    off = Math.round((Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - t) / 60000);
    if (offsetCache.size > 20000) offsetCache.clear();
    offsetCache.set(hourIndex, off);
  }
  return off;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function chicagoParts(t: number | Date) {
  const ms = typeof t === 'number' ? t : t.getTime();
  const local = new Date(Math.floor(ms / 60000) * 60000 + offsetForHour(Math.floor(ms / HOUR_MS)) * 60000);
  return { date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`, hour: local.getUTCHours(), minute: local.getUTCMinutes(), weekday: WEEKDAYS[local.getUTCDay()] };
}

/** Local (America/Chicago) calendar date for an instant. */
export const localDate = (t: number | Date = Date.now()) => chicagoParts(t).date;

/** Offset (minutes) of America/Chicago from UTC at instant t. Handles DST. */
export function tzOffsetMinutes(t: number): number {
  return offsetForHour(Math.floor(t / HOUR_MS));
}

/** Epoch ms for a local wall-clock time in America/Chicago. */
export function chicagoTime(date: string, hour = 0, minute = 0): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  let t = guess - tzOffsetMinutes(guess) * 60000;
  t = guess - tzOffsetMinutes(t) * 60000; // second pass resolves DST edges
  return t;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export const weekday = (date: string) => chicagoParts(chicagoTime(date, 12)).weekday;
export const isWeekend = (date: string) => ['Sat', 'Sun'].includes(weekday(date));

// Creating an Intl.DateTimeFormat is expensive; build each one once and reuse it.
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const dateFmts = new Map<string, Intl.DateTimeFormat>();

export function fmtTime(t: number | null | undefined): string {
  if (t == null || Number.isNaN(t)) return '—';
  return timeFmt.format(new Date(t));
}

/** Compact range for tight layouts: "6:33–11:03 AM" when both ends share AM/PM, else "6:33 AM–6:33 PM". */
export function fmtRange(a: number | null | undefined, b: number | null | undefined): string {
  const fa = fmtTime(a), fb = fmtTime(b);
  const ma = fa.slice(-2), mb = fb.slice(-2);
  if (ma === mb && (ma === 'AM' || ma === 'PM')) return `${fa.slice(0, -3)}–${fb}`;
  return `${fa}–${fb}`;
}

export function fmtDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }): string {
  const key = JSON.stringify(opts);
  let f = dateFmts.get(key);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts }); dateFmts.set(key, f); }
  return f.format(new Date(chicagoTime(date, 12)));
}

export interface SunDay {
  date: string;
  sunrise: number;
  sunset: number;
  civilDawn: number;
  civilDusk: number;
  legalStart: number;
  legalEnd: number;
  solarNoon: number;
  moon: { phase: number; phaseName: string; illumination: number; rise: number | null; set: number | null };
}

const LEGAL_OFFSET_MIN = 30; // Alabama deer: 30 min before sunrise to 30 min after sunset

export function phaseName(p: number): string {
  if (p < 0.03 || p > 0.97) return 'New moon';
  if (p < 0.22) return 'Waxing crescent';
  if (p < 0.28) return 'First quarter';
  if (p < 0.47) return 'Waxing gibbous';
  if (p < 0.53) return 'Full moon';
  if (p < 0.72) return 'Waning gibbous';
  if (p < 0.78) return 'Last quarter';
  return 'Waning crescent';
}

const sunCache = new Map<string, SunDay>();

/**
 * Sun and moon times for a date and place. Results are cached (scoring asks for the same zone and date many times)
 * and frozen so a cached value can never be changed by a caller. The moon block is computed only when read: only the
 * conditions card shows it, and computing moonrise/moonset for every zone was most of the scoring time.
 */
export function sunDay(date: string, lon: number, lat: number): SunDay {
  const key = `${date}|${lon}|${lat}`;
  const hit = sunCache.get(key);
  if (hit) return hit;
  const noon = new Date(chicagoTime(date, 12));
  const s = SunCalc.getTimes(noon, lat, lon);
  let moon: SunDay['moon'] | undefined;
  const day = {
    date,
    sunrise: s.sunrise!.getTime(),
    sunset: s.sunset!.getTime(),
    civilDawn: s.dawn!.getTime(),
    civilDusk: s.dusk!.getTime(),
    legalStart: s.sunrise!.getTime() - LEGAL_OFFSET_MIN * 60000,
    legalEnd: s.sunset!.getTime() + LEGAL_OFFSET_MIN * 60000,
    solarNoon: s.solarNoon!.getTime(),
  } as SunDay;
  Object.defineProperty(day, 'moon', {
    enumerable: true,
    get() {
      if (!moon) {
        const mi = SunCalc.getMoonIllumination(noon);
        const mt = SunCalc.getMoonTimes(new Date(chicagoTime(date, 0)), lat, lon);
        moon = Object.freeze({ phase: mi.phase, phaseName: phaseName(mi.phase), illumination: mi.fraction, rise: mt.rise ? mt.rise.getTime() : null, set: mt.set ? mt.set.getTime() : null });
      }
      return moon;
    },
  });
  Object.freeze(day);
  if (sunCache.size > 20000) sunCache.clear();
  sunCache.set(key, day);
  return day;
}

export interface SessionWindow {
  session: 'morning' | 'midday' | 'evening';
  start: number;
  end: number;
}

/** Hunt session windows. Morning: legal light → sunrise+4h. Evening: sunset−4h → legal end. Midday between. */
export function sessionWindows(sun: SunDay): Record<'morning' | 'midday' | 'evening', SessionWindow> {
  const H = 3600000;
  const morningEnd = sun.sunrise + 4 * H;
  const eveningStart = sun.sunset - 4 * H;
  return {
    morning: { session: 'morning', start: sun.legalStart, end: morningEnd },
    midday: { session: 'midday', start: morningEnd, end: Math.max(morningEnd, eveningStart) },
    evening: { session: 'evening', start: eveningStart, end: sun.legalEnd },
  };
}
