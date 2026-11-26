import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clearValue, setValue } from '../core/edit';
import { csv } from '../core/export';
import { warningFor } from '../core/warnings';
import type { PresetFile } from '../core/presets';
import { download } from './download';
import { Editor, type EditTarget } from './Editor';
import { AdviceDialog, adviceFor, CalibrateDialog, CalibrationPanel, ManufacturerBar } from './Filament';
import { dueList, TESTS, type Calibration, type CalibrationTest, type SideFinData } from '../core/sidefin';
import {
  buildRows,
  columnsFor,
  countDiffers,
  countWarnings,
  typeFamilies,
  defaultLabel,
    families,
  filterRows,
  OTHER_PAGE,
  pages as pageList,
  showValue,
  sliceOf,
  type Cell,
  type Column,
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
    cell.warning ? `${cell.warning.level === 'warn' ? 'Warning' : 'Note'}: ${cell.warning.text}` : '',
    cell.explained ? 'Marked as deliberate: no warning shown.' : '',
    edited ? 'Changed in SideFin, not exported yet.' : '',
    onEdit ? 'Click to change.' : '',
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <td className={cls} title={title} onClick={onEdit} onKeyDown={(e) => e.key === 'Enter' && onEdit?.()} tabIndex={onEdit ? 0 : undefined}>
      {v.long ? <div className={open ? 'full' : 'clamp'}>{v.full}</div> : v.text}
      {v.unknownChoice && <span className="old">old</span>}
      {cell.warning?.level === 'warn' && (
        <span className="warnmark" aria-label={`Warning: ${cell.warning.text}`}>
          !
        </span>
      )}
      {cell.warning?.level === 'hint' && <span className="hintmark" aria-label={`Note: ${cell.warning.text}`} />}
    </td>
  );
}

export function Viewer({
  baseline,
  previous,
  presets,
  printers,
  changed,
  originals,
  onUpdate,
  data,
  onData,
}: {
  baseline: Baseline;
  /** Defaults of the Orca version before, for "new in" marks. */
  previous?: Baseline;
  presets: PresetFile[];
  printers?: PrinterFamily;
  /** Settings changed in SideFin and not exported yet, per preset path. */
  changed: Record<string, string[]>;
  /** The presets as read from the folder, by path, before any change. */
  originals: Record<string, ProfileJson>;
  /** Change presets; with data, the calibration log changes in the same Undo step. */
  onUpdate: (changes: { file: PresetFile; json: ProfileJson }[], data?: SideFinData) => void;
  /** SideFin's own file: manufacturer advice, calibration log, hardware. */
  data: SideFinData;
  onData: (next: SideFinData) => void;
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
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [byType, setByType] = useState(store.get('byType') === '1');
  const [typeNozzle, setTypeNozzle] = useState<string | undefined>(store.get('typeNozzle'));
  const typeMode = kind === 'filament' && byType;
  const tNozzle = typeNozzle && allNozzles.includes(typeNozzle) ? typeNozzle : (allNozzles.find((n) => Number(n) === 0.4) ?? allNozzles[0]);
  const pickKey = typeMode ? `type:${tNozzle}` : kind;
  const [level, setLevel] = useState<Level>('advanced');
  const [onlyDiffers, setOnlyDiffers] = useState(true);
  const [onlyNozzles, setOnlyNozzles] = useState(false);
  const [onlyWarnings, setOnlyWarnings] = useState(false);
  // Values you marked as deliberate, per preset and setting; a changed value shows its warning again.
  const [explained, setExplained] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(store.get('explained') ?? '{}');
    } catch {
      return {};
    }
  });
  const isExplained = useMemo(
    () => (preset: string, key: string, value: unknown) => explained[`${preset}|${key}`] === JSON.stringify(value),
    [explained],
  );
  /** Mark the values of one setting as deliberate (or not) in every column shown. */
  const explain = (cols: { name: string; value: unknown }[], key: string, on: boolean) => {
    const next = { ...explained };
    for (const { name, value } of cols) {
      if (on) next[`${name}|${key}`] = JSON.stringify(value);
      else delete next[`${name}|${key}`];
    }
    setExplained(next);
    store.set('explained', JSON.stringify(next));
    setEditing(undefined);
  };
  const [search, setSearch] = useState('');

  const fams = useMemo(
    () => (typeMode ? typeFamilies(baseline, presets, printers, tNozzle) : families(presets, kind, printers)),
    [typeMode, baseline, presets, kind, printers, tNozzle],
  );
  const visible = (c: { nozzle?: string }) => typeMode || c.nozzle === undefined || !hidden.includes(c.nozzle);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        fams.map((f) => {
          const { columns, dflt } = columnsFor(baseline, f, presets, printers);
          const shown = columns.filter(visible);
          const r = filterRows(buildRows(baseline, kind, shown, dflt, isExplained), { level });
          return [f.name, { differs: countDiffers(r), warnings: countWarnings(r, 'warn') }];
        }),
      ),
    [fams, baseline, presets, printers, kind, level, hidden, typeMode, isExplained],
  );
  const family = fams.find((f) => f.name === picked[pickKey]) ?? fams[0];
  const view = useMemo(() => {
    if (!family) return undefined;
    const all = columnsFor(baseline, family, presets, printers);
    const columns = all.columns.filter(visible);
    return { columns, dflt: all.dflt, parents: all.parents, rows: buildRows(baseline, kind, columns, all.dflt, isExplained) };
  }, [family, baseline, presets, printers, kind, hidden, typeMode, isExplained]);
  const filamentView = kind === 'filament' && !typeMode && !!view && !!family;
  const advice = filamentView ? data.advice[family!.name] : undefined;
  const vendorValue = view?.columns[0]?.resolved.values.filament_vendor?.value;
  const vendor = Array.isArray(vendorValue) ? vendorValue[0] : vendorValue;
  const typeValue = view?.columns[0]?.resolved.values.filament_type?.value;
  const ftype = Array.isArray(typeValue) ? typeValue[0] : typeValue;
  const [adviceOpen, setAdviceOpen] = useState(false);
  const due = useMemo(
    () =>
      kind === 'filament'
        ? dueList(
            data,
            families(presets, 'filament', printers).map((f) => ({ name: f.name, nozzles: f.members.map((m) => m.nozzle) })),
          )
        : [],
    [kind, data, presets, printers],
  );
  const dueCount = useMemo(() => {
    const n: Record<string, number> = {};
    for (const d of due) n[d.filament] = (n[d.filament] ?? 0) + 1;
    return n;
  }, [due]);
  const [onlyDue, setOnlyDue] = useState(false);
  const [calibrating, setCalibrating] = useState<{ test: CalibrationTest; column: Column }>();
  const printerValues = (nozzle?: string) => {
    const p = printers?.printers.find((x) => x.nozzle !== undefined && nozzle !== undefined && Number(x.nozzle) === Number(nozzle)) ?? printers?.printers[0];
    return Object.fromEntries(Object.entries(p?.resolved.values ?? {}).map(([k, v]) => [k, v.value]));
  };
  const saveCalibration = (entry: Calibration, apply: boolean) => {
    if (!calibrating) return;
    const nextData = { ...data, calibrations: [...data.calibrations, entry] };
    const col = calibrating.column;
    const key = TESTS.find((t) => t.test === entry.test)!.key;
    if (apply && col.file && entry.value !== undefined) {
      const shown = col.resolved.values[key]?.value ?? baseline.settings[key]?.default;
      const items = Array.isArray(shown) && shown.length > 1 ? shown.map(() => entry.value!) : [entry.value];
      onUpdate([{ file: col.file, json: setValue(col.file.json, key, items, shown, sliceOf(col, key)) }], nextData);
    } else onData(nextData);
    setCalibrating(undefined);
  };
  const showDue = kind === 'filament' && !typeMode;
  const rows = view ? filterRows(view.rows, { level, onlyDiffers, onlyNozzlesDiffer: onlyNozzles, onlyWarnings, search }) : [];
  const levelRows = view ? filterRows(view.rows, { level }) : [];
  const warnCount = countWarnings(levelRows);
  // Orca's pages as tabs, remembered per tab (Printer, Filament, Process).
  const pageInfo = pageList(levelRows, rows);
  const [pageChoice, setPageChoice] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(store.get('pages') ?? '{}');
    } catch {
      return {};
    }
  });
  const page = pageInfo.find((p) => p.page === pageChoice[kind])?.page ?? pageInfo[0]?.page;
  const pickPage = (p: string) => {
    const next = { ...pageChoice, [kind]: p };
    setPageChoice(next);
    store.set('pages', JSON.stringify(next));
  };
  const filtering = onlyDiffers || onlyNozzles || onlyWarnings || !!search.trim();
  const pageRows = rows.filter((r) => r.page === page);
  // Collapsed groups, by tab, page and group, remembered.
  const [collapsed, setCollapsed] = useState<string[]>(() => (store.get('collapsed') ?? '').split('\n').filter(Boolean));
  const groupId = (group: string) => `${kind}|${page}|${group}`;
  const toggleGroup = (group: string) => {
    const id = groupId(group);
    const next = collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id];
    setCollapsed(next);
    store.set('collapsed', next.join('\n'));
  };

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

  const saveEdit = (items: string[], all: boolean) => {
    if (!editing?.column.file || !view) return;
    const { column, key, def } = editing;
    const targets = all ? view.columns.filter((c) => c.file) : [column];
    onUpdate(
      targets.map((c) => {
        const shown = c.resolved.values[key]?.value ?? def?.default ?? (def && /s$|Groups$/.test(def.type) ? [] : undefined);
        // Lists keep their own length per preset (one value per extruder).
        const own = Array.isArray(shown) && shown.length !== items.length && items.every((x) => x === items[0]) ? shown.map(() => items[0]) : items;
        return { file: c.file!, json: setValue(c.file!.json, key, own, shown, sliceOf(c, key)) };
      }),
    );
    setEditing(undefined);
  };
  /** The value your file holds for a setting, for the printer's extruder type where the file stores one per type. */
  const inFileValue = (col: Column, key: string) => {
    const v = col.file ? (originals[col.file.path]?.[key] as ProfileJson[string] | undefined) : undefined;
    const slice = sliceOf(col, key);
    if (slice && Array.isArray(v) && v.length === (slice.full as string[]).length) return v.slice(slice.index * slice.width, slice.index * slice.width + slice.width);
    return v as string | string[] | undefined;
  };
  const restore = (col: Column, key: string) => {
    if (!col.file) return;
    const original = originals[col.file.path];
    const json = original && key in original ? { ...col.file.json, [key]: original[key] } : clearValue(col.file.json, key);
    onUpdate([{ file: col.file, json }]);
    setEditing(undefined);
  };
  const clearEdit = () => {
    if (!editing?.column.file) return;
    onUpdate([{ file: editing.column.file, json: clearValue(editing.column.file.json, editing.key) }]);
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
        {kind === 'filament' && (
          <div className="seg" role="group" aria-label="Group filaments">
            <button className={byType ? '' : 'on'} title="One preset at a time, its nozzles side by side" onClick={() => (setByType(false), store.set('byType', '0'))}>
              By nozzle
            </button>
            <button className={byType ? 'on' : ''} title="All filaments of one type side by side, for one nozzle" onClick={() => (setByType(true), store.set('byType', '1'))}>
              By type
            </button>
          </div>
        )}
        {typeMode && allNozzles.length > 1 && (
          <label className="pick">
            Nozzle{' '}
            <select value={tNozzle} onChange={(e) => (setTypeNozzle(e.target.value), store.set('typeNozzle', e.target.value))}>
              {allNozzles.map((n) => (
                <option key={n} value={n}>
                  {Number(n).toFixed(2)}
                </option>
              ))}
            </select>
          </label>
        )}
        {!typeMode && allNozzles.length > 1 && (
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
          {showDue && due.length > 0 && (
            <label className="check small onlydue">
              <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} />
              Only filaments to calibrate
            </label>
          )}
          {fams.length === 0 && <p className="muted small">None found for this printer.</p>}
          {fams.filter((f) => !(showDue && onlyDue) || dueCount[f.name]).map((f) => (
            <button key={f.name} className={`fam${f === family ? ' on' : ''}`} onClick={() => setPicked({ ...picked, [pickKey]: f.name })}>
              <span>
                {f.name}
                {showDue && dueCount[f.name] > 0 && (
                  <span className="tocal" title="Pressure advance or max flow tests not done yet, or done on other hardware">
                    {dueCount[f.name]} to calibrate
                  </span>
                )}
              </span>
              <span className="cnts">
                {counts[f.name]?.warnings > 0 && (
                  <span className="wcnt" title="Settings with a warning (line width or temperature)">
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
                    {view.parents.length > 1 && ` (the ${typeMode ? "filaments" : "nozzles"} inherit from different presets: ${view.parents.join(', ')})`}
                  </span>
                )}
                <div className="chips">
                  <button className={`chip${onlyDiffers ? ' on' : ''}`} onClick={() => setOnlyDiffers(!onlyDiffers)}>
                    Only where I differ from the default
                  </button>
                  {view.columns.length > 1 && (
                    <button className={`chip${onlyNozzles ? ' on' : ''}`} onClick={() => setOnlyNozzles(!onlyNozzles)}>
                      {typeMode ? 'Only where filaments differ' : 'Only where nozzles differ'}
                    </button>
                  )}
                  {(warnCount > 0 || onlyWarnings) && (
                    <button className={`chip warn${onlyWarnings ? ' on' : ''}`} onClick={() => setOnlyWarnings(!onlyWarnings)}>
                      Only notes and warnings ({warnCount})
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

              {filamentView && (
                <>
                  <ManufacturerBar advice={advice} vendor={vendor} type={ftype} filament={family!.name} onEdit={() => setAdviceOpen(true)} />
                  <CalibrationPanel
                    filament={family!.name}
                    columns={view!.columns}
                    data={data}
                    onHardware={(hardware) => onData({ ...data, hardware })}
                    onLog={(c) => onData({ ...data, calibrations: [...data.calibrations, c] })}
                    onCalibrate={(test, column) => setCalibrating({ test, column })}
                  />
                </>
              )}
              {pageInfo.length > 0 && (
                <nav className="pages" aria-label="Orca pages">
                  {pageInfo.map((p) => (
                    <button
                      key={p.page}
                      className={`pgtab${p.page === page ? ' on' : ''}${filtering && p.hits === 0 ? ' none' : ''}`}
                      title={`${p.rows} settings on this page${p.differs ? `, ${p.differs} differ from the default` : ''}${p.warnings ? `, ${p.warnings} with a warning` : ''}${filtering ? `; ${p.hits} match the filters` : ''}`}
                      onClick={() => pickPage(p.page)}
                    >
                      {p.page === OTHER_PAGE ? 'Other' : p.page}
                      {p.warnings > 0 && <span className="wcnt">!{p.warnings}</span>}
                      <span className="cnt">{filtering ? p.hits : p.differs || ''}</span>
                    </button>
                  ))}
                </nav>
              )}
              {level !== 'all' && view.rows.some((r) => !r.def && r.cells.some((c) => c.own)) && (
                <p className="small muted obsnote">
                  This preset holds {view.rows.filter((r) => !r.def && r.cells.some((c) => c.own)).length} settings Orca {baseline.orcaVersion} does not know. Orca ignores them; level All shows them on the Other tab, and Export can remove them.
                </p>
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
                      {filamentView && <th title={advice?.product}>Manufacturer</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 && (
                      <tr>
                        <td colSpan={view.columns.length + (filamentView ? 3 : 2)} className="muted">
                          {rows.length > 0 ? 'Nothing on this page matches. The counts on the page tabs show where the matches are.' : 'No settings match. Try another level or turn off a filter.'}
                        </td>
                      </tr>
                    )}
                    {pageRows.map((r) => {
                      const head = r.group;
                      const showHead = head !== lastHead;
                      lastHead = head;
                      const closed = collapsed.includes(groupId(r.group));
                      return (
                        <Fragment key={r.key}>
                          {showHead && (
                            <tr className="grp">
                              <td colSpan={view.columns.length + (filamentView ? 3 : 2)}>
                                <button className="grpbtn" aria-expanded={!closed} onClick={() => toggleGroup(r.group)}>
                                  <span className="caret">{closed ? '\u25b8' : '\u25be'}</span> {head}
                                  {closed && <span className="muted"> · {pageRows.filter((x) => x.group === r.group).length} settings</span>}
                                </button>
                              </td>
                            </tr>
                          )}
                          {!closed && <tr>
                            <td className="name">
                              {labelOf(r)}
                              {r.def?.unit && <span className="unit"> {r.def.unit}</span>}
                              {r.def?.tooltip && (
                                <span className="tip" tabIndex={0} aria-label="What this setting does">
                                  i<span className="tipbox" role="tooltip">{r.def.tooltip}</span>
                                </span>
                              )}
                              {r.nozzlesDiffer && view.columns.length > 1 && <i className="nzdot" title="The nozzles differ" />}
                              {previous && r.def && !(r.key in previous.settings) && (
                                <span className="tag new" title={`Orca ${previous.orcaVersion} did not have this setting`}>
                                  new in {baseline.orcaVersion}
                                </span>
                              )}
                              {!r.def && r.cells.some((c) => c.own) && (
                                <span className="tag old" title="Orca ignores it. Export can remove it (checkbox in the Export dialog).">
                                  unknown to Orca {baseline.orcaVersion}
                                </span>
                              )}
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
                                      ? () => setEditing({ key: r.key, label: labelOf(r), def: r.def, column: col, cell: c, dflt: r.dflt?.value, dfltLabel: defaultLabel(view.dflt), edited, perVariant: !!sliceOf(col, r.key), others: typeMode ? view.columns.filter((x) => x.file && x !== col).length : 0, warn: (v) => warningFor(r.key, r.def, v, r.dflt?.value, { nozzle: col.nozzle, values: Object.fromEntries(Object.entries(col.resolved.values).map(([k, x]) => [k, x.value])) }), inFile: edited ? { value: inFileValue(col, r.key) } : undefined, onRestore: () => restore(col, r.key), onExplain: (on) => explain(view.columns.map((x, j) => ({ name: x.name, value: r.cells[j].value })).filter((_, j) => (on ? r.cells[j].warning : r.cells[j].explained)), r.key, on) })
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
                            {filamentView && (
                              <td className="v mf editable" title={advice?.source ? `From ${advice.source}\nClick to change.` : 'Click to add the maker\'s advice.'} onClick={() => setAdviceOpen(true)}>
                                {adviceFor(advice, r.key) ?? ''}
                              </td>
                            )}
                          </tr>}
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
                  <span className="warnmark">!</span> Likely a mistake: line width vs nozzle, or temperature vs the filament's range
                </span>
                <span>
                  <span className="hintmark" /> Far from the default (click the value to mark it as deliberate)
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
      {calibrating && family && (
        <CalibrateDialog
          filament={family.name}
          test={calibrating.test}
          column={calibrating.column}
          printer={printerValues(calibrating.column.nozzle)}
          data={data}
          def={baseline.settings[TESTS.find((t) => t.test === calibrating.test)!.key]}
          canApply={!!calibrating.column.file}
          onSave={saveCalibration}
          onClose={() => setCalibrating(undefined)}
        />
      )}
      {adviceOpen && family && (
        <AdviceDialog
          filament={family.name}
          vendor={vendor}
          type={ftype}
          advice={advice}
          onClose={() => setAdviceOpen(false)}
          onSave={(a) => {
            const next = { ...data.advice };
            if (a) next[family.name] = a;
            else delete next[family.name];
            onData({ ...data, advice: next });
            setAdviceOpen(false);
          }}
        />
      )}
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
