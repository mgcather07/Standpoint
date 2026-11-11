// Downloads the boundary polygons one state's directory is matched against, from public agency ArcGIS services,
// and writes them as GeoJSON under research/raw/states/<st>/ (git-ignored; re-run to refresh). The matching itself
// is done offline by scripts/build-state-catalog.mjs, which never fetches anything.
//
//   node scripts/fetch-state-boundaries.mjs --state GA
//
// Each source records who publishes it and the reuse terms checked before adding it (docs/STATE_ROLLOUT.md, step 3).
// Geometry is simplified (~10 m) and rounded to 5 decimals so the directory file stays small; it is a locator map,
// not a survey.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as turf from '@turf/turf';

const ROOT = path.resolve(import.meta.dirname, '..');
const PADUS_FEE = 'https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Fee_Managers_PADUS/FeatureServer/0';
const PADUS_FEDERAL = "Mang_Name IN ('USFS','FWS','NPS','DOD','USACE')";

/** Per-state sources. `label` is what build-state-catalog.mjs records as each matched feature's geometry_source. */
export const SOURCES = {
  GA: [
    {
      file: 'ga-wrd-wma.geojson',
      label: 'Georgia DNR Wildlife Resources Division, WRD_WMA_Public Boundary layer',
      url: 'https://services6.arcgis.com/9QlSLDqa0P1cHLhu/arcgis/rest/services/WRD_WMA_Public/FeatureServer/14',
      where: '1=1',
      nameField: 'PropName',
      fields: 'PropName,Owner,Acres',
      terms: 'Public layer published by GA DNR WRD (ArcGIS Online, owner WRD.ADMIN). No license stated; item note: "Features and locations shown here are approximations. Boundaries should not be considered legal."',
    },
    {
      file: 'ga-padus-federal.geojson',
      label: 'USGS PAD-US 4.1 (Fee), federal units in Georgia',
      url: PADUS_FEE,
      where: `State_Nm='GA' AND ${PADUS_FEDERAL}`,
      nameField: 'Unit_Nm',
      fields: 'Unit_Nm,Mang_Name,GIS_Acres,Agg_Src',
      // PAD-US carries some units twice (a 3.0 and a 4.0 aggregation of the same polygons); keep the newest
      pick: newestPadus,
      terms: 'USGS Gap Analysis Project; public domain (U.S. Government work). Fee ownership only, so private inholdings are not drawn as public.',
    },
  ],
};

/** Of several PAD-US records with the same unit name, keep only those from the newest PAD-US aggregation. */
function newestPadus(features) {
  const ver = (f) => Number(/PADUS(\d+)_(\d+)/.exec(f.properties?.Agg_Src ?? '')?.slice(1).join('.') ?? 0);
  const best = new Map();
  for (const f of features) { const k = f.properties?.Unit_Nm; best.set(k, Math.max(best.get(k) ?? 0, ver(f))); }
  return features.filter((f) => ver(f) === best.get(f.properties?.Unit_Nm));
}

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const j = await res.json();
      if (j.error) throw new Error(`${url}: ${JSON.stringify(j.error)}`);
      return j;
    }
    if (attempt >= 3) throw new Error(`${url}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

async function fetchLayer(src) {
  const features = [];
  for (let offset = 0; ; offset += 500) {
    const q = new URLSearchParams({ where: src.where, outFields: src.fields, outSR: '4326', returnGeometry: 'true', resultOffset: String(offset), resultRecordCount: '500', f: 'geojson' });
    const page = await getJson(`${src.url}/query?${q}`);
    features.push(...(page.features ?? []));
    if (!(page.features?.length) || !(page.exceededTransferLimit || page.properties?.exceededTransferLimit)) break;
  }
  return features;
}

const round = (g) => JSON.parse(JSON.stringify(g, (k, v) => (typeof v === 'number' && k !== 'Acres' ? Math.round(v * 1e5) / 1e5 : v)));

/** Polygons of the same named area (multi-part WMAs, refuge tracts) become one MultiPolygon. */
function mergeByName(features, nameField) {
  const groups = new Map();
  for (const f of features) {
    if (!f.geometry || !/Polygon$/.test(f.geometry.type)) continue;
    const name = String(f.properties?.[nameField] ?? '').trim();
    if (!name) continue;
    const parts = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    if (!groups.has(name)) groups.set(name, { props: { ...f.properties, name, parts: 0 }, polys: [] });
    const g = groups.get(name);
    g.polys.push(...parts);
    g.props.parts += 1;
  }
  return [...groups.values()].map(({ props, polys }) => {
    let feat = turf.feature(polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys }, props);
    feat = turf.simplify(feat, { tolerance: 0.0001, highQuality: false });
    feat.geometry = round(feat.geometry);
    return feat;
  });
}

const argv = process.argv.slice(2);
const st = (argv[argv.indexOf('--state') + 1] ?? '').toUpperCase();
if (!argv.includes('--state') || !SOURCES[st]) {
  console.error(`Pass --state with one of: ${Object.keys(SOURCES).join(', ')}`);
  process.exit(1);
}
const dir = path.join(ROOT, 'research/raw/states', st.toLowerCase());
await fs.mkdir(dir, { recursive: true });
const cli = [`node scripts/build-state-catalog.mjs --state ${st}`];
for (const src of SOURCES[st]) {
  const raw = await fetchLayer(src);
  const merged = mergeByName(src.pick ? src.pick(raw) : raw, src.nameField);
  const out = path.join(dir, src.file);
  await fs.writeFile(out, JSON.stringify({ type: 'FeatureCollection', source: { label: src.label, url: src.url, where: src.where, terms: src.terms, fetched: new Date().toISOString().slice(0, 10) }, features: merged }));
  console.log(`${src.file}: ${raw.length} polygons → ${merged.length} named areas`);
  cli.push(`--boundaries ${path.relative(ROOT, out)} --source "${src.label}"`);
}
console.log(`\nNext:\n  ${cli.join(' \\\n    ')} --name-field name --dry-run`);
