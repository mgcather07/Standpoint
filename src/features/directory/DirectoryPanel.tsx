// The Public Land Directory for a state other than Alabama: a searchable, filterable list of areas and, when one
// is tapped, its info card. Information only: no scores, no season verdicts (docs/STATE_ROLLOUT.md, display rules).
import type { StateDirectory } from './useStateDirectory';
import { typeCounts, type DirectoryArea } from '../../states/directory';
import { areaCard, areaSubtitle } from '../../states/display';
import { Button, Chip, Empty, ListRow, Notice, Spinner, Switch } from '../../ui/kit';
import { ArrowLeft, ChevronRight, ChevronUp, FileText, MapPin, Search, TreePine } from '../../ui/icons';

export function DirectoryHeader({ dir }: { dir: StateDirectory }) {
  const total = dir.fc?.features.length ?? 0;
  return (
    <div className="explore-head">
      <div className="summary">
        <span className="ico-lg" aria-hidden="true"><TreePine size={20} /></span>
        <div className="grow"><b>{dir.state.name} public land</b><div className="t-xs muted">{dir.fc ? `${total} area${total === 1 ? '' : 's'} · directory only, no zone scoring` : dir.error ? 'Could not load' : 'Loading…'}</div></div>
      </div>
      {dir.fc && !dir.selected && (
        <label className="dir-search">
          <Search size={16} aria-hidden="true" />
          <input className="input" type="search" value={dir.filter.query} onChange={(e) => dir.setFilter({ ...dir.filter, query: e.target.value })} placeholder="Search by name" aria-label={`Search ${dir.state.name} areas by name`} enterKeyHint="search" />
        </label>
      )}
    </div>
  );
}

export function DirectoryMini({ dir }: { dir: StateDirectory }) {
  return (
    <span className="mini-row">
      <TreePine size={18} aria-hidden="true" />
      <span className="grow"><b>{dir.selected?.properties.name ?? `${dir.state.name} public land`}</b></span>
      <ChevronUp size={20} className="muted" />
    </span>
  );
}

export function DirectoryBody({ dir, onShowArea }: { dir: StateDirectory; onShowArea: (a: DirectoryArea) => void }) {
  if (dir.error) return <Notice tone="bad" title={`${dir.state.name} did not load`} action={<Button size="sm" onClick={dir.retry}>Try again</Button>}>{dir.error}</Notice>;
  if (!dir.fc) return <div className="row" style={{ gap: 10, padding: 12 }}><Spinner /><span className="t-sm muted">Loading {dir.state.name} public land…</span></div>;
  if (dir.selected) return <AreaCard area={dir.selected} onBack={() => dir.setSelectedId(null)} onShow={() => onShowArea(dir.selected!)} />;

  const types = typeCounts(dir.fc.features);
  const unverified = dir.fc.features.filter((a) => a.properties.flags.includes('rules_unverified')).length;
  return (
    <div className="stack">
      <div className="chip-row" role="group" aria-label="Filter by land type">
        <Chip on={dir.filter.type === 'all'} onClick={() => dir.setFilter({ ...dir.filter, type: 'all' })}>All <small>{dir.fc.features.length}</small></Chip>
        {types.map(([t, n]) => <Chip key={t} on={dir.filter.type === t} onClick={() => dir.setFilter({ ...dir.filter, type: dir.filter.type === t ? 'all' : t })}>{t} <small>{n}</small></Chip>)}
      </div>
      {unverified > 0 && (
        <div className="row" style={{ gap: 12 }}>
          <div className="grow"><div className="t-md">Hide unverified</div><div className="t-xs muted">{unverified} area{unverified === 1 ? ' has' : 's have'} permit or weapon rules nobody has confirmed yet</div></div>
          <Switch label="Hide unverified areas" checked={dir.filter.hideUnverified} onChange={(v) => dir.setFilter({ ...dir.filter, hideUnverified: v })} />
        </div>
      )}
      {dir.visible.length ? (
        <div className="list">
          {dir.visible.map((a) => (
            <ListRow key={a.properties.id} icon={<TreePine size={18} />} title={a.properties.name} sub={<>{areaSubtitle(a.properties)}{a.properties.flags.includes('rules_unverified') && <> · <span className="badge warn">Unverified</span></>}</>}
              right={<ChevronRight size={20} className="muted" />} onClick={() => { dir.setSelectedId(a.properties.id); onShowArea(a); }} />
          ))}
        </div>
      ) : <Empty icon={<Search size={22} />} title="No areas match">Try another name or land type.</Empty>}
      <p className="t-xs muted">Areas come from research notes and public boundary data and may be incomplete. Tap one for the managing agency&rsquo;s link.</p>
    </div>
  );
}

export function AreaCard({ area, onBack, onShow }: { area: DirectoryArea; onBack: () => void; onShow: () => void }) {
  const c = areaCard(area.properties);
  return (
    <article className="stack" aria-label={c.title}>
      <Button variant="quiet" size="sm" icon={<ArrowLeft size={16} />} onClick={onBack} style={{ alignSelf: 'flex-start' }}>All areas</Button>
      <div>
        <h2>{c.title}</h2>
        {c.badges.length > 0 && <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>{c.badges.map((b) => <span key={b.id} className={`badge ${b.tone}`}>{b.label}</span>)}</div>}
      </div>
      <dl className="dir-facts">{c.rows.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>
      {c.notes && <div><div className="section-label" style={{ padding: 0 }}>{c.notesLabel}</div><p className="t-sm dim" style={{ marginTop: 4 }}>{c.notes}</p></div>}
      <Notice tone="warn" title={c.confirm}>
        {c.link ? <a href={c.link.href} target="_blank" rel="noopener noreferrer">{c.link.label}</a> : 'No agency link on file. Look up the managing agency directly.'}
      </Notice>
      <Button block icon={<MapPin size={18} />} onClick={onShow}>Show on map</Button>
      <p className="t-xs muted"><FileText size={12} aria-hidden="true" style={{ verticalAlign: '-1px' }} /> {c.provenance}</p>
    </article>
  );
}
