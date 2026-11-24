// The filament extras of step 4: the maker's advice, the calibration log and
// the "Due for calibration" list. Their data lives in sidefin/sidefin.json.

import { useEffect, useRef, useState } from 'react';
import type { Column } from '../core/table';
import { showValue } from '../core/table';
import {
  datasheetSearch,
  filamentProfilesLink,
  latest,
  otherHardware,
  TESTS,
  type Advice,
  type Due,
  type Hardware,
  type SideFinData,
} from '../core/sidefin';
import type { OrcaValue } from '../core/types';

/** The advice fields the dialog offers, by Orca setting key. */
export const ADVICE_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: 'nozzle_temperature', label: 'Nozzle temperature', hint: '°C, e.g. 240-260' },
  { key: 'hot_plate_temp', label: 'Bed temperature', hint: '°C, e.g. 70-80' },
  { key: 'fan_max_speed', label: 'Part cooling fan', hint: '%, e.g. 0-20' },
  { key: 'filament_max_volumetric_speed', label: 'Max volumetric speed', hint: 'mm³/s' },
  { key: 'filament_density', label: 'Density', hint: 'g/cm³' },
];

/** Settings that show the advice given for a related setting. */
export function adviceKey(key: string): string {
  if (/^(nozzle_temperature_initial_layer|nozzle_temperature_range_low|nozzle_temperature_range_high)$/.test(key)) return 'nozzle_temperature';
  if (/_plate_temp(_initial_layer)?$/.test(key)) return 'hot_plate_temp';
  if (key === 'fan_min_speed') return 'fan_max_speed';
  return key;
}

export function adviceFor(advice: Advice | undefined, key: string): string | undefined {
  return advice?.values[key] ?? advice?.values[adviceKey(key)];
}

function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return ref;
}

/** Edit the maker's advice of one filament. */
export function AdviceDialog({
  filament,
  vendor,
  type,
  advice,
  onSave,
  onClose,
}: {
  filament: string;
  vendor?: string;
  type?: string;
  advice?: Advice;
  onSave: (a: Advice | undefined) => void;
  onClose: () => void;
}) {
  const dialog = useModal();
  const [a, setA] = useState<Advice>(advice ?? { values: {} });
  const setValue = (key: string, v: string) => {
    const values = { ...a.values };
    if (v.trim()) values[key] = v.trim();
    else delete values[key];
    setA({ ...a, values });
  };
  const empty = !a.product && !a.source && !a.note && Object.keys(a.values).length === 0;
  const extra = Object.keys(a.values).filter((k) => !ADVICE_FIELDS.some((f) => f.key === k));
  return (
    <dialog ref={dialog} className="editor advice" onClose={onClose} onCancel={onClose}>
      <h3>Manufacturer advice</h3>
      <p className="muted small">
        {filament} ·{' '}
        <a href={datasheetSearch(vendor, a.product || filament.replace(/\s*@.*$/, ''))} target="_blank" rel="noreferrer">
          Find the data sheet
        </a>{' '}
        (opens a web search) ·{' '}
        <a href={filamentProfilesLink(vendor, type)} target="_blank" rel="noreferrer" title="Values entered by users, often with a link to the maker's site">
          3D Filament Profiles
        </a>
      </p>
      <div className="fields">
        <label>
          <span className="lbl">Product</span>
          <input value={a.product ?? ''} placeholder="as the maker names it" onChange={(e) => setA({ ...a, product: e.target.value || undefined })} />
        </label>
        <label>
          <span className="lbl">Source</span>
          <input className="wide" value={a.source ?? ''} placeholder="link to the data sheet" onChange={(e) => setA({ ...a, source: e.target.value || undefined })} />
        </label>
        {ADVICE_FIELDS.map((f) => (
          <label key={f.key}>
            <span className="lbl">{f.label}</span>
            <input value={a.values[f.key] ?? ''} placeholder={f.hint} onChange={(e) => setValue(f.key, e.target.value)} />
          </label>
        ))}
        {extra.map((k) => (
          <label key={k}>
            <span className="lbl">{k}</span>
            <input value={a.values[k]} onChange={(e) => setValue(k, e.target.value)} />
          </label>
        ))}
        <label>
          <span className="lbl">Other advice</span>
          <textarea rows={3} value={a.note ?? ''} placeholder="drying, enclosure, hardened nozzle, ..." onChange={(e) => setA({ ...a, note: e.target.value || undefined })} />
        </label>
      </div>
      <div className="actions">
        <button className="primary" onClick={() => onSave(empty ? undefined : a)}>
          Save
        </button>
        <button className="ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

/** One line above the table: whose advice, where from, and a way to find or change it. */
export function ManufacturerBar({ advice, vendor, type, filament, onEdit }: { advice?: Advice; vendor?: string; type?: string; filament: string; onEdit: () => void }) {
  return (
    <div className="mfbar small">
      <span className="lbl">Manufacturer</span>
      {advice ? (
        <>
          <b>{advice.product || filament}</b>
          {advice.source && (
            <a href={advice.source} target="_blank" rel="noreferrer">
              data sheet
            </a>
          )}
          {advice.note && <span className="muted">{advice.note}</span>}
        </>
      ) : (
        <span className="muted">No advice yet.</span>
      )}
      {!advice?.source && (
        <a href={datasheetSearch(vendor, advice?.product || filament.replace(/\s*@.*$/, ''))} target="_blank" rel="noreferrer">
          Find the data sheet
        </a>
      )}
      <a href={filamentProfilesLink(vendor, type)} target="_blank" rel="noreferrer" title="Values entered by users, often with a link to the maker's site">
        3D Filament Profiles
      </a>
      <button className="linkbtn" onClick={onEdit}>
        {advice ? 'Change' : 'Add advice'}
      </button>
    </div>
  );
}

const fmtDate = (d: string) => d.split('-').reverse().join('-');

/** Calibration results per nozzle, read from the log. Running and logging tests comes in a later step. */
export function CalibrationPanel({
  filament,
  columns,
  data,
  onHardware,
}: {
  filament: string;
  columns: Column[];
  data: SideFinData;
  onHardware: (h: Hardware) => void;
}) {
  const [editHw, setEditHw] = useState(false);
  const [hw, setHw] = useState<Hardware>(data.hardware ?? { hotend: '', extruder: '' });
  return (
    <details className="cal" open>
      <summary>
        Calibration <span className="muted small">· logging and running tests comes in version 0.6</span>
      </summary>
      <table className="caltable">
        <thead>
          <tr>
            <th>Test</th>
            {columns.map((c) => (
              <th key={c.name}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TESTS.map((t) => (
            <tr key={t.test}>
              <td>{t.label}</td>
              {columns.map((c) => {
                const entry = latest(data, filament, t.test, c.nozzle);
                const now = c.resolved.values[t.key]?.value as OrcaValue | undefined;
                const other = entry && otherHardware(entry.hardware, data.hardware);
                return (
                  <td key={c.name} className="v">
                    <span title="Value in the preset now">{showValue(undefined, now).text}</span>
                    {entry ? (
                      <span className="muted">
                        {' '}
                        · {entry.value ? `${entry.value} · ` : ''}
                        {fmtDate(entry.date)}
                      </span>
                    ) : (
                      <span className="badge"> not calibrated</span>
                    )}
                    {other && (
                      <span className="badge" title={`Tested on ${[entry.hardware?.hotend, entry.hardware?.extruder].filter(Boolean).join(' + ')}`}>
                        {' '}
                        other hardware
                      </span>
                    )}
                    {entry?.note && <div className="muted small">{entry.note}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small hw">
        Printer hardware now:{' '}
        {editHw ? (
          <>
            <input value={hw.hotend} placeholder="hotend" onChange={(e) => setHw({ ...hw, hotend: e.target.value })} />
            <input value={hw.extruder} placeholder="extruder" onChange={(e) => setHw({ ...hw, extruder: e.target.value })} />
            <button
              className="linkbtn"
              onClick={() => {
                onHardware({ hotend: hw.hotend.trim(), extruder: hw.extruder.trim() });
                setEditHw(false);
              }}
            >
              Save
            </button>
          </>
        ) : (
          <>
            <b>{data.hardware ? `${data.hardware.hotend} + ${data.hardware.extruder}` : 'not set'}</b>{' '}
            <button className="linkbtn" onClick={() => setEditHw(true)}>
              Change
            </button>
          </>
        )}
      </p>
    </details>
  );
}

const TEST_LABEL = Object.fromEntries(TESTS.map((t) => [t.test, t.test === 'pa' ? 'PA' : 'max flow']));

/** "Due for calibration", grouped per filament and test. */
export function DueList({ due, onPick }: { due: Due[]; onPick: (filament: string) => void }) {
  const groups = new Map<string, { filament: string; test: string; reason: string; nozzles: string[] }>();
  for (const d of due) {
    const id = `${d.filament}|${d.test}|${d.reason}`;
    const g = groups.get(id) ?? { filament: d.filament, test: TEST_LABEL[d.test], reason: d.reason, nozzles: [] };
    if (d.nozzle) g.nozzles.push(Number(d.nozzle).toFixed(2));
    groups.set(id, g);
  }
  if (!groups.size) return null;
  return (
    <div className="due">
      <div className="lbl">Due for calibration</div>
      {[...groups.values()].map((g) => (
        <button key={`${g.filament}|${g.test}|${g.reason}`} className="fam" onClick={() => onPick(g.filament)}>
          <span>
            {g.filament.replace(/\s*@.*$/, '')} · {g.test}
            {g.nozzles.length > 0 && <span className="muted"> {g.nozzles.join(', ')}</span>}
          </span>
          <span className="badge">{g.reason}</span>
        </button>
      ))}
    </div>
  );
}
