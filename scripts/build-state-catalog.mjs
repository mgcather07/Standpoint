// Builds one state's Public Land Directory file from the research CSV and boundary polygons you supply.
//
//   node scripts/build-state-catalog.mjs --state GA --boundaries <file.geojson> --source "<label>" [--name-field NAME] \
//        [--boundaries <file2.geojson> --source "<label2>" ...] [--dry-run]
//
// Each --boundaries file is a GeoJSON FeatureCollection of polygons already downloaded from a source whose reuse
// terms you have checked (USFS EDW, USGS PAD-US, the state agency's GIS: docs/STATE_ROLLOUT.md, step 3). The
// --source label that follows it is written to every matched feature's geometry_source. --name-field picks the
// property that holds the area name (default: the first of name, NAME, Unit_Nm, FORESTNAME, Loc_Nm found).
//
// Writes public/data/states/<st>.geojson (only rows matched with high/medium confidence; nothing is guessed) and
// research/states/reports/<ST>.md (every excluded, low-confidence and unmatched row, for the owner to review).
// --dry-run prints the summary and writes nothing. The script never fetches anything and never registers the state.
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildCatalog, parseCsv, reportMarkdown } from './lib/state-catalog.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSV = path.join(ROOT, 'research/states/public-land-master.csv');
const NAME_FIELDS = ['name', 'NAME', 'Unit_Nm', 'FORESTNAME', 'Loc_Nm'];

function args(argv) {
  const out = { state: null, inputs: [], nameField: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { const v = argv[++i]; if (v == null || v.startsWith('--')) throw new Error(`${a} needs a value`); return v; };
    if (a === '--state') out.state = next().toUpperCase();
    else if (a === '--boundaries') out.inputs.push({ file: next(), source: null });
    else if (a === '--source') { const last = out.inputs.at(-1); if (!last || last.source) throw new Error('--source must follow its --boundaries file'); last.source = next(); }
    else if (a === '--name-field') out.nameField = next();
    else if (a === '--dry-run') out.dryRun = true;
    else throw new Error(`Unknown argument ${a}`);
  }
  if (!out.state || !/^[A-Z]{2}$/.test(out.state)) throw new Error('Pass --state with a two-letter state code, for example --state GA');
  if (out.state === 'AL') throw new Error('Alabama is the reference implementation and is not built by this script.');
  for (const x of out.inputs) if (!x.source) throw new Error(`${x.file}: add --source "<label>" after it (recorded as geometry_source)`);
  return out;
}

async function loadCandidates(inputs, nameField) {
  const all = [];
  for (const { file, source } of inputs) {
    const fc = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
    for (const f of fc.features ?? []) {
      if (!f?.geometry || !/Polygon$/.test(f.geometry.type)) continue;
      const p = f.properties ?? {};
      const field = nameField ?? NAME_FIELDS.find((k) => p[k]);
      const name = field ? p[field] : null;
      if (name) all.push({ name: String(name), geometry: f.geometry, source });
    }
  }
  return all;
}

let opt;
try { opt = args(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
const rows = parseCsv(await fs.readFile(CSV, 'utf8'));
const candidates = await loadCandidates(opt.inputs, opt.nameField);
const result = buildCatalog(opt.state, rows, candidates);
const s = result.summary;
if (!s.rows) throw new Error(`No rows for ${opt.state} in ${path.relative(ROOT, CSV)}`);
console.log(`${opt.state}: ${s.rows} rows · ${s.matched} matched · ${s.excluded} excluded by flag · ${s.low} low-confidence · ${s.unmatched} without a boundary (${candidates.length} boundary polygons read)`);

if (opt.dryRun) { console.log('Dry run: nothing written.'); process.exit(0); }

const date = new Date().toISOString().slice(0, 10);
const reportFile = path.join(ROOT, 'research/states/reports', `${opt.state}.md`);
await fs.mkdir(path.dirname(reportFile), { recursive: true });
await fs.writeFile(reportFile, reportMarkdown(opt.state, result, { date, sources: opt.inputs.map((x) => `${x.source} (${path.basename(x.file)})`) }));
console.log(`Wrote ${path.relative(ROOT, reportFile)}`);

if (!s.matched) { console.log('No matched areas, so no GeoJSON was written.'); process.exit(0); }
const outFile = path.join(ROOT, 'public/data/states', `${opt.state.toLowerCase()}.geojson`);
await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, JSON.stringify({ ...result.fc, generated: date, state: opt.state }));
console.log(`Wrote ${path.relative(ROOT, outFile)}. Register the state in src/states/registry.ts (dataFile) to show it in the picker.`);
