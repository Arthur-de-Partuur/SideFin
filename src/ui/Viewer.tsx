import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clearValue, setValue } from '../core/edit';
import { csv } from '../core/export';
import { warningFor } from '../core/warnings';
import type { PresetFile } from '../core/presets';
import { download } from './download';
import { Editor, type EditTarget } from './Editor';
import {
  buildRows,
  columnsFor,
  countDiffers,
  countWarnings,
  defaultLabel,
    families,
  filterRows,
  showValue,
  sliceOf,
  type Cell,
  type Level,
  type PrinterFamily,
  type Row,
} from '../core/table';
import type { Baseline, PresetKind, ProfileJson } from '../core/types';

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

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(`sidefin.${k}`) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(`sidefin.${k}`, v);
    } catch {
      /* not remembered */
    }
  },
};

/** One value. Long text (G-code, notes) is shown in full, wrapped, up to a few lines unless the row is opened. */
function ValueCell({
  row,
  cell,
  open,
  extra = '',
  note,
  edited,
  onEdit,
}: {
  row: Row;
  cell: Pick<Cell, 'value'> & Partial<Cell>;
  open: boolean;
  extra?: string;
  note?: string;
  edited?: boolean;
  onEdit?: () => void;
}) {
  const v = showValue(row.def, cell.value);
  const cls = ['v', v.long ? 'txt' : '', cell.differs ? 'dev' : '', cell.own ? 'own' : cell.origin === 'default' ? 'builtin' : '', edited ? 'edited' : '', onEdit ? 'editable' : '', extra].join(' ');
  const title = [
    cell.origin ? sourceText(cell as Cell) : note,
    v.unknownChoice ? 'Old value: Orca converts or ignores it.' : '',
    cell.warning ? `Warning: ${cell.warning}` : '',
    edited ? 'Changed in SideFin, not exported yet.' : '',
    onEdit ? 'Click to change.' : '',
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <td className={cls} title={title} onClick={onEdit} onKeyDown={(e) => e.key === 'Enter' && onEdit?.()} tabIndex={onEdit ? 0 : undefined}>
      {v.long ? <div className={open ? 'full' : 'clamp'}>{v.full}</div> : v.text}
      {v.unknownChoice && <span className="old">old</span>}
      {cell.warning && (
        <span className="warnmark" aria-label={`Warning: ${cell.warning}`}>
          !
        </span>
      )}
    </td>
  );
}

export function Viewer({
  baseline,
  presets,
  printers,
  changed,
  onUpdate,
}: {
  baseline: Baseline;
  presets: PresetFile[];
  printers?: PrinterFamily;
  /** Settings changed in SideFin and not exported yet, per preset path. */
  changed: Record<string, string[]>;
  onUpdate: (file: PresetFile, json: ProfileJson) => void;
}) {
  const [editing, setEditing] = useState<EditTarget>();
  const allNozzles = useMemo(() => (printers?.printers.map((p) => p.nozzle).filter((n): n is string => !!n) ?? []), [printers]);
  const [hidden, setHidden] = useState<string[]>(() => (store.get('hiddenNozzles') ?? '').split(',').filter(Boolean));
  const toggleNozzle = (n: string) => {
    const next = hidden.includes(n) ? hidden.filter((x) => x !== n) : [...hidden, n];
    if (allNozzles.every((x) => next.includes(x))) return; // keep at least one
    setHidden(next);
    store.set('hiddenNozzles', next.join(','));
  };
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const toggleRow = (key: string) => {
    const next = new Set(opened);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpened(next);
  };
  const [kind, setKind] = useState<PresetKind>('filament');
  const [picked, setPicked] = useState<Partial<Record<PresetKind, string>>>({});
  const [level, setLevel] = useState<Level>('advanced');
  const [onlyDiffers, setOnlyDiffers] = useState(true);
  const [onlyNozzles, setOnlyNozzles] = useState(false);
  const [onlyWarnings, setOnlyWarnings] = useState(false);
  const [search, setSearch] = useState('');

  const fams = useMemo(() => families(presets, kind, printers), [presets, kind, printers]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        fams.map((f) => {
          const { columns, dflt } = columnsFor(baseline, f, presets, printers);
          const shown = columns.filter((c) => c.nozzle === undefined || !hidden.includes(c.nozzle));
          const r = filterRows(buildRows(baseline, kind, shown, dflt), { level });
          return [f.name, { differs: countDiffers(r), warnings: countWarnings(r) }];
        }),
      ),
    [fams, baseline, presets, printers, kind, level, hidden],
  );
  const family = fams.find((f) => f.name === picked[kind]) ?? fams[0];
  const view = useMemo(() => {
    if (!family) return undefined;
    const all = columnsFor(baseline, family, presets, printers);
    const columns = all.columns.filter((c) => c.nozzle === undefined || !hidden.includes(c.nozzle));
    return { columns, dflt: all.dflt, parents: all.parents, rows: buildRows(baseline, kind, columns, all.dflt) };
  }, [family, baseline, presets, printers, kind, hidden]);
  const rows = view ? filterRows(view.rows, { level, onlyDiffers, onlyNozzlesDiffer: onlyNozzles, onlyWarnings, search }) : [];
  const warnCount = view ? countWarnings(filterRows(view.rows, { level })) : 0;

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

  const downloadCsv = () => {
    if (!view || !family) return;
    const full = (v: Parameters<typeof showValue>[1], def: Row['def']) => {
      const x = showValue(def, v);
      return x.full ?? x.text;
    };
    const table = [
      ['Page', 'Group', 'Setting', 'Key', 'Unit', ...view.columns.map((c) => c.name), view.dflt?.name ?? 'Default'],
      ...rows.map((r) => [r.page, r.group, labelOf(r), r.key, r.def?.unit ?? '', ...r.cells.map((c) => full(c.value, r.def)), full(r.dflt?.value, r.def)]),
    ];
    download(`${family.name}.csv`, csv(table), 'text/csv');
  };

  const saveEdit = (items: string[]) => {
    if (!editing?.column.file) return;
    const { column, key, def, cell } = editing;
    const shown = cell.value ?? (def && /s$|Groups$/.test(def.type) ? [] : undefined);
    onUpdate(column.file!, setValue(column.file!.json, key, items, shown, sliceOf(column, key)));
    setEditing(undefined);
  };
  const clearEdit = () => {
    if (!editing?.column.file) return;
    onUpdate(editing.column.file, clearValue(editing.column.file.json, editing.key));
    setEditing(undefined);
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
        {allNozzles.length > 1 && (
          <div className="nozzles" role="group" aria-label="Nozzles shown">
            <span className="lbl">Nozzles</span>
            {allNozzles.map((n) => (
              <label key={n} className={`nz-pick${hidden.includes(n) ? '' : ' on'}`}>
                <input type="checkbox" checked={!hidden.includes(n)} onChange={() => toggleNozzle(n)} />
                {Number(n).toFixed(2)}
              </label>
            ))}
          </div>
        )}
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
              <span className="cnts">
                {counts[f.name]?.warnings > 0 && (
                  <span className="wcnt" title="Settings with a warning">
                    !{counts[f.name].warnings}
                  </span>
                )}
                <span className="cnt" title="Settings that differ from the default">
                  {counts[f.name]?.differs || ''}
                </span>
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
                    {view.columns.length === 0 && ' · none of the chosen nozzles has this preset'}
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
                  {(warnCount > 0 || onlyWarnings) && (
                    <button className={`chip warn${onlyWarnings ? ' on' : ''}`} onClick={() => setOnlyWarnings(!onlyWarnings)}>
                      Only warnings ({warnCount})
                    </button>
                  )}
                  <button className="chip" title="Download the rows shown here as a CSV file, for a spreadsheet" onClick={downloadCsv}>
                    Download CSV
                  </button>
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
                      <th title={view.dflt?.name}>{defaultLabel(view.dflt)}</th>
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
                            <td className="name">
                              {labelOf(r)}
                              {r.def?.unit && <span className="unit"> {r.def.unit}</span>}
                              {r.def?.tooltip && (
                                <span className="tip" tabIndex={0} aria-label="What this setting does">
                                  i<span className="tipbox" role="tooltip">{r.def.tooltip}</span>
                                </span>
                              )}
                              {r.nozzlesDiffer && view.columns.length > 1 && <i className="nzdot" title="The nozzles differ" />}
                              <div className="k">{r.key}</div>
                              {[...r.cells.map((c) => c.value), r.dflt?.value].some((v) => showValue(r.def, v).long) && (
                                <MoreButton open={opened.has(r.key)} onToggle={() => toggleRow(r.key)} />
                              )}
                            </td>
                            {r.cells.map((c, i) => {
                              const col = view.columns[i];
                              const edited = !!col.file && changed[col.file.path]?.includes(r.key);
                              return (
                                <ValueCell
                                  key={i}
                                  row={r}
                                  cell={c}
                                  open={opened.has(r.key)}
                                  edited={edited}
                                  onEdit={
                                    col.file && !r.def?.readonly
                                      ? () => setEditing({ key: r.key, label: labelOf(r), def: r.def, column: col, cell: c, dflt: r.dflt?.value, dfltLabel: defaultLabel(view.dflt), edited, perVariant: !!sliceOf(col, r.key), warn: (v) => warningFor(r.key, r.def, v, r.dflt?.value, { nozzle: col.nozzle, values: Object.fromEntries(Object.entries(col.resolved.values).map(([k, x]) => [k, x.value])) }) })
                                      : undefined
                                  }
                                />
                              );
                            })}
                            <ValueCell
                              row={r}
                              cell={{ value: r.dflt?.value }}
                              open={opened.has(r.key)}
                              extra={`dflt${r.dflt?.origin === 'default' ? ' builtin-d' : ''}`}
                              note={r.dflt?.origin === 'default' ? "Orca's built-in default: no RatRig or Orca profile sets this" : r.dflt ? `From "${r.dflt.from}"` : undefined}
                            />
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
                  <span className="warnmark">!</span> Looks odd: far from the default, line width vs nozzle, or temperature vs filament range
                </span>
                <span>
                  <b>Bold</b>: set in this preset · normal: inherited · <i className="muted">grey italic</i>: Orca's built-in default
                </span>
                <span>Hover a value to see where it comes from, or the i to see what a setting does. Click a value of your preset to change it.</span>
              </div>
            </>
          )}
        </main>
      </div>
      {editing && <Editor key={`${editing.column.name}|${editing.key}`} target={editing} onSave={saveEdit} onClear={clearEdit} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

/**
 * "Show all" for a row with long text. It hides itself when every text in the
 * row already fits in the clamped cell, so it only shows when there is more.
 */
function MoreButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [needed, setNeeded] = useState(true);
  useLayoutEffect(() => {
    const row = ref.current?.closest('tr');
    if (!row || open) return;
    const check = () => setNeeded([...row.querySelectorAll('.clamp')].some((el) => el.scrollHeight > el.clientHeight + 1));
    check();
    const watch = new ResizeObserver(check);
    watch.observe(row);
    return () => watch.disconnect();
  }, [open]);
  return (
    <button ref={ref} className="more" onClick={onToggle} style={open || needed ? undefined : { visibility: 'hidden', height: 0, padding: 0 }} tabIndex={open || needed ? 0 : -1}>
      {open ? 'Show less' : 'Show all'}
    </button>
  );
}
