# State rollout: public land beyond Alabama

Standpoint covers Alabama only today. This file is the work queue for adding other states **one state at a time**.
Work one state per session. Never batch several states. Update the tracker at the bottom when a state is done.

The research input is `research/states/public-land-master.csv` (1,430 rows, 22 states, frozen 2026-11-09).
It was gathered by AI research agents from agency websites, so treat it as a list of leads, not as verified fact. Every row carries `flags`; respect them.

## What exists today (read before changing anything)

- Alabama is modeled as four hardcoded "regions" in `src/engine/regions.ts` (Bankhead NF / Black Warrior WMA, plus the Choccolocco, Hollins and Oakmulgee WMAs). Each has a precomputed terrain/road/route data pack under `public/data/`, built by `scripts/*` from `scripts/config.mjs`.
- 2026-27 regulations are hand-verified and Alabama-specific (`src/engine/regulations.ts`: zones `C`/`D`, `WMA_CALENDARS`). Rut timing is Alabama-zone based (`src/engine/rut.ts`).
- The time zone is hardcoded to `America/Chicago` (`src/engine/time.ts`, `weather.ts`, `climate.ts`). Wrong for Eastern-time states.
- There is no state concept in the UI. Everything is Alabama.

**Do not** try to give 1,400 areas a terrain pack and verified regulations. That is a multi-month effort and the engine would present unverified rules as verified. Use two layers:

### Layer A: Public Land Directory (this rollout)
Every area becomes a map polygon plus an info card: name, state, type, agency, acreage, notes, link to the agency's rules. **No scoring and no legal verdicts.** Loaded lazily per state so only the chosen state's file downloads.

### Layer B: Intelligence packs (later, only when asked)
Promote chosen areas to the full engine (terrain pack, verified regs, rut zone, correct time zone). Needs the engine generalized first (per-region time zone, per-state regulations, rut by region). Do not start this unless the user asks.

## Phase 0: foundation (do once, before any state)

1. **State model.** Add a `StateId` type and a `STATES` registry (`id`, `name`, `bbox`, `tz`, `dataFile`). Alabama (`AL`) points at the existing regions and keeps working unchanged. Do not modify engine behavior for Alabama.
2. **State picker UI.** A control to choose the state (default Alabama), persisted in `localStorage` (wrap reads/writes in try/catch). Choosing a state fits the map to that state's bounds and loads `public/data/states/<st>.geojson` lazily. States with no data yet are listed as "coming soon" or hidden.
3. **Directory UI** for non-Alabama states: map layer + list, filter by `land_type_std`, search by name, toggle "hide unverified". Tapping an area opens an info card (see display rules).
4. **Build script** `scripts/build-state-catalog.mjs --state GA` (see per-state workflow).
5. **Tests** for the state registry, the loader, and the display rules. `npm test`, `npm run lint` and `npm run build` must pass.

Read `src/features/you/Welcome.tsx`, `YouScreen.tsx`, `src/map/MapView.tsx`, `src/lib/workspaces.ts`, `src/data.ts` first to see how Alabama regions are selected today and fit the picker into that, not around it.

## Data: the master CSV

Columns: `state, name, land_type_std, land_type, managing_agency, acreage, acreage_num, acreage_note, acreage_agent_value, county_or_region, deer_notes, source_url, flags`.

- `land_type_std` is the normalized category (National Forest, State Forest, State WMA / Wildlife Area, National Wildlife Refuge, State Game Land, State Park, Military, Army Corps / Lake Lands, Watershed Lands, State Public Land (other), Local / Municipal Land, National Park Service, Cooperative / Private-Access Land, WMA on National Forest, Program (not a tract)).
- Forest names carry the state, for example `Daniel Boone National Forest (KY)`. Keep that labeling everywhere it is shown.
- `acreage_usfs_official` rows use USFS Land Area Report acreage (see `acreage_note`); the agent's original value is kept in `acreage_agent_value`.

Flags:

| Flag | Meaning | What to do |
|---|---|---|
| `aggregate_or_nontract` | Statewide or system-level row, not a tract | Exclude from the map |
| `private_or_coop` | Private or utility-owned co-op land | Exclude from the map |
| `maybe_not_deer` | Notes suggest no deer hunting (small game, waterfowl, closed) | Hide until verified |
| `overlaps_national_forest` | WMA sitting on national forest land | Draw under the forest; never add acreages |
| `acreage_missing` / `acreage_unparsed` | No usable acreage | Show "acreage not listed"; never fill from memory |
| `rules_unverified` | Permit/quota/weapon rules unconfirmed | Show an "unverified" badge |
| `source_wikipedia` | Acreage from Wikipedia | Prefer an agency source when found |
| `source_homepage_or_blank` | Source URL is only a homepage | Find the area-specific page when possible |
| `row_repaired` / `label_added` | Cleaned in the merge | Informational |

## Display rules (hunters rely on this; do not weaken)

- The directory never says an area is "legal to hunt" or "open". It shows the agency's information and: **"Confirm seasons, permits and boundaries with the managing agency before you hunt."** with the area's `source_url`.
- Never show a number or rule the data doesn't contain. Blank stays blank.
- Do not run the scoring engine on directory areas. Alabama's existing behavior is untouched.

## Per-state workflow

1. `git checkout -b state/<st>` from an up-to-date `main`.
2. Read that state's rows from the CSV and the "known gaps" line in the tracker.
3. Resolve a boundary polygon for each row. Candidate sources, in order: USFS EDW for national forests (`fetch-sources.mjs` already queries USFS ArcGIS for Alabama), USGS PAD-US for WMAs, state forests and refuges, then the state wildlife agency's GIS. Confirm each source is reachable and permits reuse before relying on it, and record it in each feature's `geometry_source`.
4. Match by normalized name within the state. Record `match_confidence` (`high`, `medium`, `low`). Show only `high`/`medium`. Never guess a polygon. List every unmatched or low row in `research/states/reports/<ST>.md` for the owner to review.
5. Write `public/data/states/<st>.geojson`. Feature properties: `id, state, name, land_type_std, agency, acres, acres_verified, county_or_region, notes, source_url, flags, geometry_source, match_confidence`.
6. Fill gaps where an official page exists (acreage, area-specific rules link). Record what was filled and from where in the state report.
7. Register the state in `STATES`, run `npm test`, `npm run lint`, `npm run build`, and check the state in `npm run dev` (picker, filters, a few area cards).
8. Update the tracker row (status, date, matched/unmatched counts), commit, and push the branch. **Do not run `npm run deploy` or any firebase deploy.** Stop and report; the owner deploys.

## Order and tracker

Status: `todo`, `in progress`, `done`. Alabama is the reference implementation.

| # | State | Rows | Usable | Missing acreage | NF rows | Status | Known gaps (from research) |
|---|---|---:|---:|---:|---:|---|---|
| 0 | AL | n/a | n/a | n/a | n/a | done (in app) | Reference. Keep unchanged. |
| 1 | GA | 84 | 84 | 9 | 1 | todo | Some counties from memory; no acreage for Savannah, Eufaula, Fort Stewart, Fort Moore, Moody, Cumberland Island, Hartwell, Russell, B.F. Grant; per-WMA quota rules unverified; Wolf Island and Banks Lake NWRs and state park hunts missing. |
| 2 | TN | 33 | 33 | 24 | 1 | todo | Thin: only about 10 rows have acreage. North Cumberland WMA shows 146,000 and about 205,000; LBL TN portion 60,000 vs 40,000; Chuck Swan, Ames Plantation, Hiwassee, Yuchi, Laurel Hill and other WMAs missing. Needs a second research pass. |
| 3 | MS | 51 | 51 | 10 | 6 | todo | WMA acreage from Wikipedia; 14 WMAs overlap national forest rows; WMAs under 5,000 acres, Okatibbee, Tenn-Tom, Camp Shelby, state forests missing; Corps acreage blank. |
| 4 | FL | 137 | 137 | 7 | 3 | todo | Many northern WMA quota rules unverified; state forest acreage blank; Lake Woodruff and Loxahatchee deer hunts unverified; some rows are small-game or waterfowl only. |
| 5 | KY | 66 | 66 | 54 | 2 | todo | Thin: most acreage blank. Peabody WMA 40,747 vs 60,000+; Cave Run/Zilpo, Jenny Wiley, Otter Creek, Reelfoot and Jefferson NF rows may not belong. Needs a second research pass. |
| 6 | NC | 55 | 54 | 43 | 4 | todo | Thin: most acreage blank; game land counties from memory; large game lands missing; private-timber access program unverified. Needs a second research pass. |
| 7 | SC | 41 | 41 | 4 | 2 | todo | Cape Romain NWR, Corps lakes (Hartwell, Thurmond, Russell), Fort Jackson and most WMAs under 3,000 acres missing; Jocassee Gorges acreage from a 2021 secondary source. |
| 8 | VA | 66 | 65 | 32 | 1 | todo | Non-WMA rows were written from memory (verify); 23 WMAs have no acreage; state forest list may be incomplete. |
| 9 | WV | 52 | 51 | 2 | 2 | todo | WMA and state forest acreage from Wikipedia (East Lynn Lake and Sleepy Creek both show 22,928: one is likely wrong); co-op WMAs on the national forests not listed separately. |
| 10 | OH | 31 | 31 | 4 | 4 | todo | Wayne NF unit acreage unpublished; Mohican-Memorial, Wildcat Hollow, Pleasant Hill, Crown City, Brush Creek, AEP ReCreation Land and most Corps lakes missing; counties often inferred. |
| 11 | PA | 42 | 41 | 10 | 1 | todo | Only the 10 largest State Game Lands listed; state forest acreage from Wikipedia; system total of about 1.5 million acres unconfirmed. |
| 12 | LA | 53 | 53 | 3 | 6 | todo | Catahoula Lake WMA, White Lake Wetlands, Barksdale AFB and most Corps lakes missing; some refuge deer rules unverified. |
| 13 | NY | 109 | 109 | 23 | 1 | todo | State forest list incomplete and from memory; Zoar Valley, Shawangunk Ridge and Sterling Forest missing; acreage from Wikipedia. |
| 14 | MD | 55 | 55 | 6 | 0 | todo | Federal and military rows written from memory; area-level permit rules unverified. |
| 15 | NJ | 110 | 110 | 10 | 0 | todo | WMA acreage from Wikipedia; open-to-deer not checked per WMA; park/forest counties from memory; Cape May NWR left out. |
| 16 | DE | 28 | 28 | 7 | 0 | todo | Acreage from Wikipedia; only 2 of 8 deer-permit state parks identified. |
| 17 | CT | 167 | 161 | 1 | 0 | todo | Best-sourced state (CT DEEP 2026 list). Season/weapon symbols per area not tied; Great Thicket NWR missing. |
| 18 | MA | 74 | 74 | 6 | 0 | todo | State forest hunting status unconfirmed ("most" allow it); acreage from Wikipedia; Mount Greylock, Fort Devens, Monomoy and Nantucket NWRs not checked. |
| 19 | RI | 92 | 62 | 0 | 0 | todo | 30 co-op rows are private (excluded); counties are towns. |
| 20 | VT | 21 | 20 | 0 | 1 | todo | Other state WMAs missing; Jay and Victory State Forest acreage conflict between state pages. |
| 21 | NH | 26 | 25 | 2 | 1 | todo | WMAs are one aggregate row; state forest acreage from a Wikipedia mirror. |
| 22 | ME | 37 | 36 | 11 | 1 | todo | Baxter State Park and Aroostook NWR hunting status conflict between sources; big commercial timberlands missing; WMAs are one aggregate row. |

Alabama's neighbors come first (GA, TN, MS, FL), then KY. Re-order if the owner says so.

## Open questions for the owner (ask, don't assume)

- Where should the state picker live in the UI (header, You screen, map)?
- Should "coming soon" states appear in the picker, or only states with data?
- Which areas, if any, should be promoted to full intelligence packs (Layer B) first?
