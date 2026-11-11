# GA directory build report

Generated 2026-11-10 by `scripts/build-state-catalog.mjs --state GA`.

- Rows in master CSV: 84
- Drawn on the map (high/medium match): 70
- Excluded by flag: 0
- Low-confidence match (not drawn, needs review): 10
- No boundary found (not drawn, needs review): 4

## Boundary sources

- Georgia DNR Wildlife Resources Division, WRD_WMA_Public Boundary layer (ga-wrd-wma.geojson)
- USGS PAD-US 4.1 (Fee), federal units in Georgia (ga-padus-federal.geojson)

## Low-confidence matches

| Name | Type | Acres | Flags | Note |
|---|---|---:|---|---|
| Chattahoochee Fall Line WMA: Hilliard Plantation Tract | State WMA / Wildlife Area | 8089 |  | partial name overlap: CHATTAHOOCHEE WMA; CHATTAHOOCHEE FALL LINE WMA - HILLIARD; Chattahoochee National Forest |
| Hannahatchee Creek WMA | State WMA / Wildlife Area | 5095 |  | partial name overlap: HANNAHATCHEE WMA |
| Lanahassee Creek WMA | State WMA / Wildlife Area | 4420 |  | partial name overlap: LANAHASSEE WMA |
| Upatoi Ravines Natural Area | State WMA / Wildlife Area | 9500 |  | partial name overlap: UPATOI NATURAL AREA |
| Chattahoochee-Oconee National Forest (GA) | National Forest | 867265 | acreage_usfs_official | partial name overlap: CHATTAHOOCHEE WMA; OCONEE WMA; Chattahoochee National Forest |
| Savannah National Wildlife Refuge (GA tracts) | National Wildlife Refuge | not listed | acreage_missing | partial name overlap: Savannah National Wildlife Refuge |
| Wassaw Island National Wildlife Refuge (GA) | National Wildlife Refuge | 10053 |  | partial name overlap: Wassaw National Wildlife Refuge |
| Fort Stewart / Hunter Army Airfield (GA) | Military | not listed | acreage_missing, rules_unverified | partial name overlap: Fort Stewart; Hunter Army Airfield |
| Moody Air Force Base hunting program (GA) | Military | not listed | acreage_missing, rules_unverified | partial name overlap: MOODY FOREST WMA; Moody Air Force Base |
| Richard B. Russell Lake (USACE, GA) | Army Corps / Lake Lands | not listed | acreage_missing | partial name overlap: LAKE RUSSELL WMA; RICHARD B. RUSSELL STATE PARK |

## No boundary found

| Name | Type | Acres | Flags | Note |
|---|---|---:|---|---|
| Eufaula National Wildlife Refuge (GA portion) | National Wildlife Refuge | not listed | acreage_missing, rules_unverified |  |
| Fort Moore (GA portion) | Military | not listed | acreage_missing, rules_unverified |  |
| Lake Sidney Lanier (USACE, GA) | Army Corps / Lake Lands | 1711 |  |  |
| Hartwell Lake (USACE, GA) | Army Corps / Lake Lands | not listed | acreage_missing |  |

## Excluded by flag

_None._

## Gaps filled from official pages

None filled. Every value on the cards comes from the master CSV unchanged.

- **B.F. Grant WMA acreage** stays blank: the official page (https://georgiawildlife.com/bf-grant-wma) reads "This 11,40-acre property", which is a typo, so no number was taken from it. The WRD layer's GIS acreage was not used either (a computed area is not a published figure).
- **Cumberland Island National Seashore acreage** stays blank: the seashore's total area is not the area open to the managed hunts, so it was not filled.

---

_Everything below was written by hand during the GA review (2026-11-10). Re-running the build script regenerates the sections above and drops this part; copy it back._

## Source reuse terms (checked 2026-11-10)

- **GA DNR WRD `WRD_WMA_Public`, layer 14 "Boundary"** (https://services6.arcgis.com/9QlSLDqa0P1cHLhu/arcgis/rest/services/WRD_WMA_Public/FeatureServer/14). Published publicly on ArcGIS Online by the WRD.ADMIN account. No license is stated. The item says "Features and locations shown here are approximations. Boundaries should not be considered legal." Same footing as the ADCNR layer used for Alabama. Owner: confirm you are comfortable relying on it.
- **USGS PAD-US 4.1, Fee Managers** (https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Fee_Managers_PADUS/FeatureServer/0), filtered to `State_Nm='GA'` and federal managers (USFS, FWS, NPS, DOD, USACE). U.S. Government work, public domain. Fee ownership only, so private inholdings are not drawn as public, and only the Georgia part of a multi-state unit is included.
- Download with `node scripts/fetch-state-boundaries.mjs --state GA` (writes to the git-ignored `research/raw/states/ga/`). Polygons of the same name were merged (multi-tract WMAs such as Lake Seminole, Townsend, Ceylon), then simplified to about 10 m. PAD-US lists some units twice (its 3.0 and 4.0 aggregations of the same polygons); only the newest record of each is kept.

## What to decide on the rows not drawn

Each suggested boundary below looks like the same place to a reader, but the names differ, so the matcher did not draw it. Approve or reject each one; nothing is drawn until you do.

| CSV row | Suggested boundary | Why it was held back |
|---|---|---|
| Chattahoochee Fall Line WMA: Hilliard Plantation Tract | WRD `CHATTAHOOCHEE FALL LINE WMA - HILLIARD` | Boundary name has no "Plantation" |
| Hannahatchee Creek WMA | WRD `HANNAHATCHEE WMA` | Boundary name has no "Creek" |
| Lanahassee Creek WMA | WRD `LANAHASSEE WMA` | Boundary name has no "Creek" |
| Upatoi Ravines Natural Area | WRD `UPATOI NATURAL AREA` | Boundary name has no "Ravines" |
| Wassaw Island National Wildlife Refuge (GA) | PAD-US `Wassaw National Wildlife Refuge` | Boundary name has no "Island" |
| Savannah National Wildlife Refuge (GA tracts) | PAD-US `Savannah National Wildlife Refuge` (Georgia part only) | Row covers the GA tracts; PAD-US Georgia fee land may include tracts not open to hunting |
| Chattahoochee-Oconee National Forest (GA) | PAD-US `Chattahoochee National Forest` + `Oconee National Forest` (fee land) | One CSV row, two federal units; would need combining into one area |
| Fort Stewart / Hunter Army Airfield (GA) | PAD-US `Fort Stewart` (+ `Hunter Army Airfield`?) | Hunting is on Fort Stewart training areas; the airfield is unlikely to be hunted. Installation boundary is not the hunt area |
| Moody Air Force Base hunting program (GA) | PAD-US `Moody Air Force Base` | Hunt program areas are not the whole base |
| Richard B. Russell Lake (USACE, GA) | PAD-US `Richard B. Russell Recreation Area` | Corps fee land around the lake, not a defined hunting area. Do not confuse with WRD `LAKE RUSSELL WMA` (a different place, already drawn) |

No boundary candidate at all:

- **Eufaula NWR (GA portion)**: not in PAD-US Georgia federal fee land. FWS's own refuge layer may have it.
- **Fort Moore (GA portion)**: PAD-US still names it `Fort Benning` (renamed 2023). Same caveat as the other installations: the installation is not the hunt area.
- **Lake Sidney Lanier (USACE, GA)** and **Hartwell Lake (USACE, GA)**: PAD-US has `Sidney Lanier Recreation Area` and `Hartwell Recreation Area`, which are all Corps land around the lakes. The CSV row for Lanier lists 1,711 acres, far less than the Corps land, so the row means the hunting tracts only. Needs the Corps' hunting-area maps.

## Notes on areas that are drawn

- **The national forest is not drawn**, so north Georgia shows the WRD WMA boundaries on the forest (Chattahoochee, Blue Ridge, Rich Mountain and others) without a forest polygon underneath.
- **Type "Cooperative / Private-Access Land" without a `private_or_coop` flag** (12 rows: Cedar Creek, Redlands, Chestatee, Chattahoochee, John's Mountain, Blue Ridge, Rich Mountain, Swallow Creek, Lake Russell, Warwoman, Berry College, Oconee). The flag rules were followed as written, so they are drawn with the CSV type shown on the card. WRD's layer lists their owner as USFS for most, "Multiple" for several, "Private" for Berry College and "DNR,private" for Oconee WMA. Most are WMAs on national forest that should probably be "WMA on National Forest" with `overlaps_national_forest`. Correct in the CSV if you agree.
- **Fort Eisenhower** is drawn with PAD-US's whole-installation fee boundary. Hunting there is limited to designated training areas; the card shows the confirm line and the CSV's link (GA WRD's special federal regulations page).
- **Cumberland Island National Seashore** is drawn with the PAD-US NPS fee boundary; hunts there are limited managed hunts.
- **Bullard Creek WMA** is drawn from WRD's main `BULLARD CREEK WMA` polygon only. WRD lists three more tracts (Montgomery, Ocmulgee, Bell Telephone) under separate names, which are not included. **Ocmulgee WMA**'s separate `Gum Swamp Creek` tract is likewise not included.
- **Dixon Memorial WMA** is typed "State Forest" in the CSV; WRD lists the owner as GFC (Georgia Forestry Commission). Shown as typed.
