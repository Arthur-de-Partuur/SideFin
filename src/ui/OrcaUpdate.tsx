// "What changed in Orca": what an Orca update changes for your presets (G5).

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { setValue } from '../core/edit';
import { olderVersions, updateReport, type StaleValue, type UpdateChange } from '../core/orcaUpdate';
import type { PresetFile } from '../core/presets';
import { showValue, sliceOf, type Column } from '../core/table';
import type { Baseline, OrcaValue, PresetKind, ProfileJson } from '../core/types';

const KIND_LABEL: Record<PresetKind, string> = { printer: 'Printer', filament: 'Filament', process: 'Process' };

/** The preset with a value set, for the column's extruder type where it stores one per type. */
function withValue(json: ProfileJson, col: Column, key: string, value: OrcaValue | undefined): ProfileJson {
  const items = Array.isArray(value) ? value.map(String) : [String(value ?? '')];
  return setValue(json, key, items, col.resolved.values[key]?.value, sliceOf(col, key));
}

/** One undo step for many rows: changes to the same file are applied one after the other. */
function apply(rows: { column: Column; key: string; value: OrcaValue | undefined }[]): { file: PresetFile; json: ProfileJson }[] {
  const out = new Map<string, { file: PresetFile; json: ProfileJson }>();
  for (const r of rows) {
    const file = r.column.file;
    if (!file) continue;
    const cur = out.get(file.path) ?? { file, json: file.json };
    out.set(file.path, { file, json: withValue(cur.json, r.column, r.key, r.value) });
  }
  return [...out.values()];
}

export function OrcaUpdateDialog({
  versions,
  baseline,
  load,
  presets,
  printerName,
  changed,
  onUpdate,
  onClose,
}: {
  /** All Orca versions SideFin has defaults for. */
  versions: string[];
  /** The defaults of the Orca version chosen at the top: the "new" version. */
  baseline: Baseline;
  load: (version: string) => Promise<Baseline>;
  presets: PresetFile[];
  printerName?: string;
  /** Settings changed in SideFin and not exported yet, per preset path: those count as your choice. */
  changed: Record<string, string[]>;
  onUpdate: (changes: { file: PresetFile; json: ProfileJson }[]) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  const older = olderVersions(versions, baseline.orcaVersion);
  const [from, setFrom] = useState(older[0]);
  const [before, setBefore] = useState<Baseline>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!from) return;
    setBefore(undefined);
    load(from).then(setBefore, (e) => setError(`Could not load the Orca ${from} defaults (${(e as Error).message}).`));
  }, [from]);
  const report = useMemo(() => {
    if (!before) return undefined;
    const r = updateReport(before, baseline, presets, printerName);
    // A value you just pinned or set here is your choice, not a copied old default.
    return { ...r, stale: r.stale.filter((s) => !(s.column.file && changed[s.column.file.path]?.includes(s.key))) };
  }, [before, baseline, presets, printerName, changed]);

  const label = (key: string) => {
    const d = baseline.settings[key] ?? before?.settings[key];
    return d?.fullLabel && d.label && d.fullLabel !== d.label ? `${d.fullLabel}: ${d.label}` : d?.fullLabel ?? d?.label ?? key;
  };
  const place = (key: string) => {
    const ui = baseline.settings[key]?.ui;
    return ui ? `${ui.page} · ${ui.group}` : 'not shown in Orca';
  };
  const val = (key: string, v: OrcaValue | undefined) => showValue(baseline.settings[key] ?? before?.settings[key], v).text || '(empty)';

  return (
    <dialog ref={dialog} className="editor wide orcaupd" onClose={onClose} onCancel={onClose}>
      <h3>What changed in Orca</h3>
      {!from ? (
        <p className="small">SideFin has no defaults for an Orca version older than {baseline.orcaVersion}, so there is nothing to compare with yet.</p>
      ) : (
        <p className="small">
          From Orca{' '}
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {older.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>{' '}
          to Orca <b>{baseline.orcaVersion}</b> (chosen at the top), for {printerName ? <b>{printerName}</b> : 'your printer'} and the presets that fit it.
        </p>
      )}
      {error && <p className="error small">{error}</p>}
      {from && !report && !error && <p className="muted small">Loading the Orca {from} defaults…</p>}
      {report && (
        <>
          <Section
            title="Changed without you touching it"
            count={report.changes.length}
            intro={`Your preset inherits these, and the inherited value is different in Orca ${report.to}. Pin the old value to keep printing as before, or leave it to follow Orca.`}
            empty="Nothing: every inherited value is the same. Presets that set every value themselves are not affected by changed defaults."
            rows={report.changes}
            action={{ label: 'Pin the old value', all: 'Pin all old values', value: (c: UpdateChange) => c.before }}
            cols={['Was', 'Now']}
            cells={(c: UpdateChange) => [val(c.key, c.before), val(c.key, c.after)]}
            title2={(c: UpdateChange) => `now from ${c.from === 'default' ? "Orca's built-in default" : c.from}`}
            label={label}
            place={place}
            onApply={(rows) => onUpdate(apply(rows))}
          />
          <Section
            title="Your value is the old default"
            count={report.stale.length}
            intro={`Your preset sets these to the value that was the default in Orca ${report.from}, and the default changed. If you copied the old default rather than chose it, take the new one.`}
            empty="Nothing: none of your own values is an old default that changed."
            rows={report.stale}
            action={{ label: 'Take the new default', all: 'Take all new defaults', value: (s: StaleValue) => s.after }}
            cols={['Yours (old default)', 'New default']}
            cells={(s: StaleValue) => [val(s.key, s.yours), val(s.key, s.after)]}
            title2={(s: StaleValue) => `default: ${s.dfltName}`}
            label={label}
            place={place}
            onApply={(rows) => onUpdate(apply(rows))}
          />
          <details className="updsec">
            <summary>
              New settings in Orca {report.to} <span className="cnt">{report.added.length}</span>
            </summary>
            {report.added.length === 0 ? (
              <p className="muted small">None.</p>
            ) : (
              (['printer', 'filament', 'process'] as PresetKind[]).map((k) => {
                const list = report.added.filter((a) => a.kind === k);
                if (!list.length) return null;
                return (
                  <Fragment key={k}>
                    <h4>
                      {KIND_LABEL[k]} <span className="muted">({list.length})</span>
                    </h4>
                    <ul className="small cols">
                      {list.map((a) => (
                        <li key={a.key} title={a.key}>
                          {label(a.key)} <span className="muted">· {place(a.key)}</span>
                        </li>
                      ))}
                    </ul>
                  </Fragment>
                );
              })
            )}
          </details>
          <details className="updsec" open={report.obsolete.length > 0}>
            <summary>
              Settings Orca {report.to} no longer knows <span className="cnt">{report.obsolete.reduce((n, o) => n + o.keys.length, 0)}</span>
            </summary>
            {report.obsolete.length === 0 ? (
              <p className="muted small">None of your presets holds one.</p>
            ) : (
              <>
                <p className="small">Orca ignores these. Export can remove them (the checkbox in the Export dialog).</p>
                <ul className="small">
                  {report.obsolete.map((o) => (
                    <li key={o.file.path}>
                      <b>{o.file.json.name}</b>: <code>{o.keys.join(', ')}</code>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </details>
        </>
      )}
      <div className="actions">
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}

interface Rowish {
  kind: PresetKind;
  family: string;
  label: string;
  key: string;
  column: Column;
}

function Section<T extends Rowish>({
  title,
  count,
  intro,
  empty,
  rows,
  action,
  cols,
  cells,
  title2,
  label,
  place,
  onApply,
}: {
  title: string;
  count: number;
  intro: string;
  empty: string;
  rows: T[];
  action: { label: string; all: string; value: (r: T) => OrcaValue | undefined };
  cols: [string, string];
  cells: (r: T) => [string, string];
  title2: (r: T) => string;
  label: (key: string) => string;
  place: (key: string) => string;
  onApply: (rows: { column: Column; key: string; value: OrcaValue | undefined }[]) => void;
}) {
  const toRow = (r: T) => ({ column: r.column, key: r.key, value: action.value(r) });
  const groups = new Map<string, T[]>();
  for (const r of rows) groups.set(`${KIND_LABEL[r.kind]} · ${r.family}`, [...(groups.get(`${KIND_LABEL[r.kind]} · ${r.family}`) ?? []), r]);
  return (
    <details className="updsec" open={count > 0}>
      <summary>
        {title} <span className="cnt">{count}</span>
      </summary>
      <p className="small">{count ? intro : empty}</p>
      {count > 0 && (
        <>
          <table className="upd small">
            <thead>
              <tr>
                <th>Setting</th>
                <th>Nozzle</th>
                <th>{cols[0]}</th>
                <th>{cols[1]}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...groups.entries()].map(([g, list]) => (
                <Fragment key={g}>
                  <tr className="grp">
                    <td colSpan={4}>{g}</td>
                    <td>
                      {list.length > 1 && (
                        <button className="linkbtn" onClick={() => onApply(list.map(toRow))}>
                          {action.all.replace(/^(\w+) all/, '$1 these')}
                        </button>
                      )}
                    </td>
                  </tr>
                  {list.map((r) => {
                    const [a, b] = cells(r);
                    return (
                      <tr key={`${r.column.name}|${r.key}`}>
                        <td title={`${r.key} · ${place(r.key)}`}>{label(r.key)}</td>
                        <td>{r.label}</td>
                        <td className="v">{a}</td>
                        <td className="v" title={title2(r)}>
                          {b}
                        </td>
                        <td>
                          {r.column.file ? (
                            <button className="linkbtn" onClick={() => onApply([toRow(r)])}>
                              {action.label}
                            </button>
                          ) : (
                            <span className="muted">no preset of yours</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p className="small">
            <button className="linkbtn" onClick={() => onApply(rows.map(toRow))}>
              {action.all} ({count})
            </button>{' '}
            <span className="muted">· One Undo takes it back; nothing is written until you export.</span>
          </p>
        </>
      )}
    </details>
  );
}
