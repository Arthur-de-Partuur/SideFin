import { Fragment, useMemo, useState } from 'react';
import type { PresetFile } from '../core/presets';
import {
  buildRows,
  columnsFor,
  countDiffers,
  families,
  filterRows,
  showValue,
  type Cell,
  type Level,
  type PrinterFamily,
  type Row,
} from '../core/table';
import type { Baseline, PresetKind } from '../core/types';

const TABS: { kind: PresetKind; label: string }[] = [
  { kind: 'printer', label: 'Printer' },
  { kind: 'filament', label: 'Filament' },
  { kind: 'process', label: 'Process' },
];

const LEVELS: { level: Level; label: string; title: string }[] = [
  { level: 'simple', label: 'Simple', title: "Settings Orca shows in Simple mode" },
  { level: 'advanced', label: 'Advanced', title: "Settings Orca shows in Advanced mode" },
  { level: 'all', label: 'All', title: 'Also hidden settings and settings without a field in Orca' },
];

/** Orca shows the bed temperatures per plate type in rows named after the plate. */
const PLATES: Record<string, string> = {
  cool: 'Cool Plate',
  supertack: 'Cool Plate (SuperTack)',
  textured_cool: 'Textured Cool Plate',
  eng: 'Engineering Plate',
  hot: 'Smooth PEI / High Temp Plate',
  textured: 'Textured PEI Plate',
};

function sourceText(c: Cell): string {
  if (c.origin === 'default') return "Orca's built-in default";
  if (c.own) return 'Set in this preset';
  return `From ${c.origin === 'system' ? 'system preset' : 'your preset'} "${c.from}"`;
}

function ValueCell({ row, cell }: { row: Row; cell: Cell }) {
  const v = showValue(row.def, cell.value);
  const cls = ['v', cell.differs ? 'dev' : '', cell.own ? 'own' : cell.origin === 'default' ? 'builtin' : ''].join(' ');
  const title = [v.full, sourceText(cell), v.unknownChoice ? 'Old value: Orca converts or ignores it.' : ''].filter(Boolean).join('\n');
  return (
    <td className={cls} title={title}>
      {v.text}
      {v.unknownChoice && <span className="old">old</span>}
    </td>
  );
}

export function Viewer({ baseline, presets, printers }: { baseline: Baseline; presets: PresetFile[]; printers?: PrinterFamily }) {
  const [kind, setKind] = useState<PresetKind>('filament');
  const [picked, setPicked] = useState<Partial<Record<PresetKind, string>>>({});
  const [level, setLevel] = useState<Level>('advanced');
  const [onlyDiffers, setOnlyDiffers] = useState(true);
  const [onlyNozzles, setOnlyNozzles] = useState(false);
  const [search, setSearch] = useState('');

  const fams = useMemo(() => families(presets, kind, printers), [presets, kind, printers]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        fams.map((f) => {
          const { columns, dflt } = columnsFor(baseline, f, presets, printers);
          return [f.name, countDiffers(filterRows(buildRows(baseline, kind, columns, dflt), { level }))];
        }),
      ),
    [fams, baseline, presets, printers, kind, level],
  );
  const family = fams.find((f) => f.name === picked[kind]) ?? fams[0];
  const view = useMemo(() => {
    if (!family) return undefined;
    const { columns, dflt, parents } = columnsFor(baseline, family, presets, printers);
    return { columns, dflt, parents, rows: buildRows(baseline, kind, columns, dflt) };
  }, [family, baseline, presets, printers, kind]);
  const rows = view ? filterRows(view.rows, { level, onlyDiffers, onlyNozzlesDiffer: onlyNozzles, search }) : [];

  // Orca repeats short labels such as "First layer" within a group; use the full label there.
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(`${r.page}|${r.group}|${r.def?.label}`, (seen.get(`${r.page}|${r.group}|${r.def?.label}`) ?? 0) + 1);
  const labelOf = (r: Row) => {
    const label = r.def?.label || r.def?.fullLabel || r.key;
    if ((seen.get(`${r.page}|${r.group}|${r.def?.label}`) ?? 0) < 2) return label;
    const plate = r.key.match(/^(\w+)_plate_temp/);
    if (plate) return `${PLATES[plate[1]] ?? plate[1]}: ${label.toLowerCase()}`;
    return r.def?.fullLabel || label;
  };

  let lastHead = '';
  return (
    <div className="viewer">
      <div className="bar">
        <nav className="tabs" aria-label="Preset kind">
          {TABS.map((t) => (
            <button key={t.kind} className={`tab${t.kind === kind ? ' on' : ''}`} onClick={() => setKind(t.kind)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="seg" role="group" aria-label="Detail level">
          {LEVELS.map((l) => (
            <button key={l.level} className={l.level === level ? 'on' : ''} title={l.title} onClick={() => setLevel(l.level)}>
              {l.label}
            </button>
          ))}
        </div>
        <input className="search" type="search" placeholder="Search settings" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="body">
        <aside className="side">
          <div className="lbl">
            {TABS.find((t) => t.kind === kind)?.label} presets{printers ? ` · ${printers.name}` : ''}
          </div>
          {fams.length === 0 && <p className="muted small">None found for this printer.</p>}
          {fams.map((f) => (
            <button key={f.name} className={`fam${f === family ? ' on' : ''}`} onClick={() => setPicked({ ...picked, [kind]: f.name })}>
              <span>{f.name}</span>
              <span className="cnt" title="Settings that differ from the default">
                {counts[f.name] || ''}
              </span>
            </button>
          ))}
        </aside>

        <main className="main">
          {family && view && (
            <>
              <div className="mhead">
                <h2>{family.name}</h2>
                {view.dflt && (
                  <span className="muted small">
                    compared with <b>{view.dflt.name}</b>
                    {view.parents.length > 1 && ` (the nozzles inherit from different presets: ${view.parents.join(', ')})`}
                  </span>
                )}
                <div className="chips">
                  <button className={`chip${onlyDiffers ? ' on' : ''}`} onClick={() => setOnlyDiffers(!onlyDiffers)}>
                    Only where I differ from the default
                  </button>
                  {view.columns.length > 1 && (
                    <button className={`chip${onlyNozzles ? ' on' : ''}`} onClick={() => setOnlyNozzles(!onlyNozzles)}>
                      Only where nozzles differ
                    </button>
                  )}
                </div>
              </div>

              {view.columns.some((c) => c.resolved.problems.length > 0) && (
                <details className="problems">
                  <summary>Things SideFin noticed</summary>
                  <ol>
                    {[...new Set(view.columns.flatMap((c) => c.resolved.problems))].map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ol>
                </details>
              )}

              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Setting</th>
                      {view.columns.map((c) => (
                        <th key={c.name} title={c.name}>
                          {c.label}
                        </th>
                      ))}
                      <th title={view.dflt?.name}>Default</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={view.columns.length + 2} className="muted">
                          No settings match. Try another level or turn off a filter.
                        </td>
                      </tr>
                    )}
                    {rows.map((r) => {
                      const head = `${r.page} · ${r.group}`;
                      const showHead = head !== lastHead;
                      lastHead = head;
                      return (
                        <Fragment key={r.key}>
                          {showHead && (
                            <tr className="grp">
                              <td colSpan={view.columns.length + 2}>{head}</td>
                            </tr>
                          )}
                          <tr>
                            <td className="name" title={r.def?.tooltip}>
                              {labelOf(r)}
                              {r.def?.unit && <span className="unit"> {r.def.unit}</span>}
                              {r.nozzlesDiffer && view.columns.length > 1 && <i className="nzdot" title="The nozzles differ" />}
                              <div className="k">{r.key}</div>
                            </td>
                            {r.cells.map((c, i) => (
                              <ValueCell key={i} row={r} cell={c} />
                            ))}
                            <td className="v dflt" title={showValue(r.def, r.dflt?.value).full}>
                              {showValue(r.def, r.dflt?.value).text}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="legend">
                <span>
                  <i className="sw dev" />
                  Differs from the default
                </span>
                <span>
                  <i className="sw nzdot" />
                  Nozzles differ
                </span>
                <span>
                  <b>Bold</b>: set in this preset · normal: inherited · <span className="muted">grey</span>: Orca's built-in default
                </span>
                <span>Hover a value to see where it comes from.</span>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
