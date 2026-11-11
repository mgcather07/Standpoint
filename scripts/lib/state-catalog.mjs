// Pure helpers for scripts/build-state-catalog.mjs: read the master CSV, decide which rows may be drawn,
// match rows to boundary polygons by name, and build the directory GeoJSON and the owner's review report.
// No network, no file system: the CLI does I/O; this module is unit-tested (src/states/catalog.test.ts).

/** Flags that keep a row off the map entirely (docs/STATE_ROLLOUT.md, "Flags"). */
export const EXCLUDE_FLAGS = ['aggregate_or_nontract', 'private_or_coop'];
/** Flags that hide a row until someone verifies it. */
export const HIDE_FLAGS = ['maybe_not_deer'];
/** Only these match levels are written to the map. */
export const SHOWN_CONFIDENCE = ['high', 'medium'];

/** RFC 4180-style CSV (quoted fields, doubled quotes, CRLF or LF). Returns objects keyed by the header row. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((x) => x.trim() !== ''));
  const [header, ...body] = nonEmpty;
  if (!header) return [];
  return body.map((r, n) => {
    if (r.length !== header.length) throw new Error(`CSV row ${n + 2} has ${r.length} fields, expected ${header.length}`);
    return Object.fromEntries(header.map((h, k) => [h.trim(), r[k].trim()]));
  });
}

export const parseFlags = (s) => (s ?? '').split(/[;|]/).map((x) => x.trim()).filter(Boolean);

/** Why a row stays off the map, or null when it may be drawn (if a polygon is found). */
export function exclusionReason(row) {
  const flags = parseFlags(row.flags);
  const ex = flags.find((f) => EXCLUDE_FLAGS.includes(f));
  if (ex) return ex;
  const hide = flags.find((f) => HIDE_FLAGS.includes(f));
  if (hide) return hide;
  return null;
}

const ABBREVIATIONS = [
  [/\bwmas?\b/g, 'wildlife management area'],
  [/\bnwr\b/g, 'national wildlife refuge'],
  [/\bnf\b/g, 'national forest'],
  [/\bsf\b/g, 'state forest'],
  [/\bsp\b/g, 'state park'],
  [/\bsgl\b/g, 'state game lands'],
  [/\bmtn\b/g, 'mountain'],
  [/\bmt\b/g, 'mount'],
  [/\bft\b/g, 'fort'],
  [/\bst\b/g, 'saint'],
];
/** Generic words removed for the medium-confidence comparison. */
const GENERIC = /\b(national|state|forest|forests|wildlife|management|area|areas|refuge|game|lands?|park|public|hunting|unit|tract|the|of|and)\b/g;

/** Lower-case, drop the "(GA)" state label and punctuation, expand common abbreviations. */
export function normalizeName(name) {
  let s = String(name ?? '').toLowerCase();
  s = s.replace(/\([a-z]{2}\)/g, ' ').replace(/&/g, ' and ').replace(/[’'`.]/g, '').replace(/[^a-z0-9]+/g, ' ');
  for (const [re, to] of ABBREVIATIONS) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}
export const coreName = (name) => normalizeName(name).replace(GENERIC, ' ').replace(/\s+/g, ' ').trim();

/**
 * Match one CSV row to boundary candidates ({ name, geometry, source }). Never guesses:
 * high = same normalized name; medium = same core name (type words removed) and exactly one candidate;
 * low = ambiguous or only a partial name overlap (reported, never drawn); none = nothing found.
 */
export function matchRow(row, candidates) {
  const full = normalizeName(row.name), core = coreName(row.name);
  const exact = candidates.filter((c) => normalizeName(c.name) === full);
  if (exact.length === 1) return { confidence: 'high', candidate: exact[0] };
  if (exact.length > 1) return { confidence: 'low', candidate: null, note: `${exact.length} boundaries share this name` };
  if (!core) return { confidence: 'none', candidate: null };
  const sameCore = candidates.filter((c) => coreName(c.name) === core);
  if (sameCore.length === 1) return { confidence: 'medium', candidate: sameCore[0] };
  if (sameCore.length > 1) return { confidence: 'low', candidate: null, note: `${sameCore.length} boundaries share the core name "${core}"` };
  const words = core.split(' ');
  const partial = candidates.filter((c) => { const cc = coreName(c.name); return cc && (cc.includes(core) || words.every((w) => cc.split(' ').includes(w))); });
  if (partial.length) return { confidence: 'low', candidate: null, note: `partial name overlap: ${partial.slice(0, 3).map((c) => c.name).join('; ')}` };
  return { confidence: 'none', candidate: null };
}

const slug = (s) => normalizeName(s).replace(/ /g, '-').slice(0, 60);
const num = (s) => { const n = Number(String(s ?? '').replace(/,/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
const url = (s) => (/^https?:\/\//i.test(String(s ?? '').trim()) ? String(s).trim() : null);
const blank = (s) => (String(s ?? '').trim() === '' ? null : String(s).trim());

/** Directory feature properties for a matched row (the schema in docs/STATE_ROLLOUT.md, step 5). */
export function featureProps(row, id, match) {
  const flags = parseFlags(row.flags);
  return {
    id,
    state: row.state.toUpperCase(),
    name: row.name,
    land_type_std: row.land_type_std,
    agency: blank(row.managing_agency),
    acres: num(row.acreage_num),
    acres_verified: flags.includes('acreage_usfs_official'),
    county_or_region: blank(row.county_or_region),
    notes: blank(row.deer_notes),
    source_url: url(row.source_url),
    flags,
    geometry_source: match.candidate.source,
    match_confidence: match.confidence,
  };
}

/**
 * Build one state's catalog: rows → { fc, report }. candidates are boundary polygons already loaded from the
 * sources the operator chose (each carries its own `source` label for geometry_source).
 */
export function buildCatalog(state, rows, candidates) {
  const st = state.toUpperCase();
  const mine = rows.filter((r) => (r.state ?? '').toUpperCase() === st);
  const features = [], excluded = [], unmatched = [], low = [];
  const used = new Map();
  for (const row of mine) {
    const why = exclusionReason(row);
    if (why) { excluded.push({ row, why }); continue; }
    const m = matchRow(row, candidates);
    if (m.confidence === 'none') { unmatched.push({ row }); continue; }
    if (!SHOWN_CONFIDENCE.includes(m.confidence)) { low.push({ row, note: m.note }); continue; }
    const base = `${st.toLowerCase()}-${slug(row.name)}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    features.push({ type: 'Feature', properties: featureProps(row, n > 1 ? `${base}-${n}` : base, m), geometry: m.candidate.geometry });
  }
  // national forests first so the WMAs on them draw on top; acreages are never summed anywhere
  features.sort((a, b) => Number(b.properties.land_type_std === 'National Forest') - Number(a.properties.land_type_std === 'National Forest'));
  return { fc: { type: 'FeatureCollection', features }, summary: { rows: mine.length, matched: features.length, excluded: excluded.length, unmatched: unmatched.length, low: low.length }, excluded, unmatched, low };
}

/** research/states/reports/<ST>.md: everything the owner needs to review by hand. */
export function reportMarkdown(state, result, { date, sources }) {
  const st = state.toUpperCase();
  const { summary: s } = result;
  const line = (r, extra = '') => `| ${r.name.replace(/\|/g, '/')} | ${r.land_type_std} | ${r.acreage_num || 'not listed'} | ${parseFlags(r.flags).join(', ') || ''} | ${extra.replace(/\|/g, '/')} |`;
  const table = (items, extraOf) => items.length ? ['| Name | Type | Acres | Flags | Note |', '|---|---|---:|---|---|', ...items.map((x) => line(x.row, extraOf(x)))].join('\n') : '_None._';
  return [
    `# ${st} directory build report`,
    '',
    `Generated ${date} by \`scripts/build-state-catalog.mjs --state ${st}\`.`,
    '',
    `- Rows in master CSV: ${s.rows}`,
    `- Drawn on the map (high/medium match): ${s.matched}`,
    `- Excluded by flag: ${s.excluded}`,
    `- Low-confidence match (not drawn, needs review): ${s.low}`,
    `- No boundary found (not drawn, needs review): ${s.unmatched}`,
    '',
    '## Boundary sources',
    '',
    sources.length ? sources.map((x) => `- ${x}`).join('\n') : '_None supplied. Nothing can be drawn until boundary polygons are provided._',
    '',
    '## Low-confidence matches',
    '',
    table(result.low, (x) => x.note ?? ''),
    '',
    '## No boundary found',
    '',
    table(result.unmatched, () => ''),
    '',
    '## Excluded by flag',
    '',
    table(result.excluded, (x) => x.why),
    '',
    '## Gaps filled from official pages',
    '',
    '_None yet. Record each filled value and its source here._',
    '',
  ].join('\n');
}
