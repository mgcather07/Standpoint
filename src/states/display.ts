// What an area's info card says. Hunters rely on this, so the rules in docs/STATE_ROLLOUT.md ("Display rules")
// live here in one place and are unit-tested: never a verdict ("legal", "open"), never a number the data does not
// contain, and always the line telling the hunter to confirm with the managing agency.
import type { AreaProps } from './directory';
import { isUnverified } from './directory';

export const CONFIRM_LINE = 'Confirm seasons, permits and boundaries with the managing agency before you hunt.';
export const NO_ACREAGE = 'Acreage not listed';

export interface CardBadge { id: 'unverified' | 'overlaps_nf'; label: string; tone: 'warn' | 'info' }
export interface CardRow { label: string; value: string }
export interface AreaCardModel {
  title: string;
  type: string;
  badges: CardBadge[];
  rows: CardRow[];
  /** Research notes, shown as-is with their provenance. */
  notes: string | null;
  notesLabel: string;
  link: { href: string; label: string } | null;
  confirm: string;
  provenance: string;
}

const fmtAcres = (n: number) => `${Math.round(n).toLocaleString('en-US')} acres`;

/** Acreage exactly as the data has it, labelled with where it came from; blank stays "not listed". */
export function acreageText(p: Pick<AreaProps, 'acres' | 'acres_verified' | 'flags'>): string {
  if (p.acres == null) return NO_ACREAGE;
  if (p.acres_verified) return `${fmtAcres(p.acres)} (USFS Land Area Report)`;
  if (p.flags.includes('source_wikipedia')) return `${fmtAcres(p.acres)} (from Wikipedia, not agency-confirmed)`;
  return `${fmtAcres(p.acres)} (research figure, not agency-confirmed)`;
}

export function areaCard(p: AreaProps): AreaCardModel {
  const badges: CardBadge[] = [];
  if (isUnverified(p)) badges.push({ id: 'unverified', label: 'Unverified', tone: 'warn' });
  if (p.flags.includes('overlaps_national_forest')) badges.push({ id: 'overlaps_nf', label: 'On national forest land', tone: 'info' });
  const rows: CardRow[] = [{ label: 'Type', value: p.land_type_std }];
  if (p.agency) rows.push({ label: 'Managed by', value: p.agency });
  rows.push({ label: 'Size', value: acreageText(p) });
  if (p.county_or_region) rows.push({ label: 'County or region', value: p.county_or_region });
  const homepage = p.flags.includes('source_homepage_or_blank');
  return {
    title: p.name,
    type: p.land_type_std,
    badges,
    rows,
    notes: p.notes,
    notesLabel: 'Research notes (not verified)',
    link: p.source_url ? { href: p.source_url, label: homepage ? 'Agency website' : 'Agency page for this area' } : null,
    confirm: CONFIRM_LINE,
    provenance: `Boundary: ${p.geometry_source} (${p.match_confidence} name match).`,
  };
}

/** Short list subtitle: type and size only. */
export const areaSubtitle = (p: AreaProps) => `${p.land_type_std} · ${p.acres == null ? NO_ACREAGE.toLowerCase() : fmtAcres(p.acres)}`;

/** Map colors per land type (fallback for anything else). */
export const TYPE_COLORS: Record<string, string> = {
  'National Forest': '#5fbf6a',
  'WMA on National Forest': '#e9a824',
  'State WMA / Wildlife Area': '#e9a824',
  'State Game Land': '#e9a824',
  'National Wildlife Refuge': '#4aa3e0',
  'State Forest': '#3fbfa8',
  'State Park': '#a974e6',
  'National Park Service': '#a974e6',
  'Military': '#9aa0a6',
  'Army Corps / Lake Lands': '#5ab4e6',
};
export const OTHER_COLOR = '#d9b38c';
