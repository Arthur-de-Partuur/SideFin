// The filament extras of step 4: the maker's advice, the calibration log and
// the "Due for calibration" list. Their data lives in sidefin/sidefin.json.

import { useEffect, useRef, useState } from 'react';
import type { Column } from '../core/table';
import { showValue } from '../core/table';
import {
  datasheetSearch,
  filamentProfilesLink,
  lastMethod,
  latest,
  otherHardware,
  TESTS,
  type Advice,
  type Calibration,
  type CalibrationTest,
  type Hardware,
  type SideFinData,
} from '../core/sidefin';
import type { OrcaValue, SettingDef } from '../core/types';
import { fmt, methodById, methodsFor, num, orcaFlowRatio, setup } from '../core/calibrate';
import { checkItem } from '../core/edit';

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
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Log method for "the value in the preset is fine as it is". */
export const ACCEPTED = 'accepted as is';

/** Calibration results per nozzle, read from the log, with Calibrate and Value is OK per test. */
export function CalibrationPanel({
  filament,
  columns,
  data,
  onHardware,
  onLog,
  onCalibrate,
}: {
  filament: string;
  columns: Column[];
  data: SideFinData;
  onHardware: (h: Hardware) => void;
  /** Add a line to the calibration log. */
  onLog: (c: Calibration) => void;
  /** Open the Calibrate dialog for a test on one nozzle. */
  onCalibrate: (test: CalibrationTest, column: Column) => void;
}) {
  const [editHw, setEditHw] = useState(false);
  const [hw, setHw] = useState<Hardware>(data.hardware ?? { hotend: '', extruder: '' });
  return (
    <details className="cal" open>
      <summary>
        Calibration <span className="muted small">· click Calibrate to set up a test and log its result</span>
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
                const shown = showValue(undefined, now).text;
                const accept = () =>
                  onLog({
                    filament,
                    ...(c.nozzle ? { nozzle: c.nozzle } : {}),
                    test: t.test,
                    date: today(),
                    ...(shown ? { value: shown } : {}),
                    ...(data.hardware ? { hardware: data.hardware } : {}),
                    method: ACCEPTED,
                  });
                return (
                  <td key={c.name} className="v">
                    <span title="Value in the preset now">{shown}</span>
                    {entry ? (
                      <span className="muted">
                        {' '}
                        · {[entry.method === ACCEPTED ? 'OK as is' : entry.value, entry.temperature ? `at ${entry.temperature} °C` : '', fmtDate(entry.date)].filter(Boolean).join(' · ')}
                      </span>
                    ) : (
                      <span className="muted"> · not calibrated</span>
                    )}
                    {other && (
                      <span className="muted" title={`Tested on ${[entry.hardware?.hotend, entry.hardware?.extruder].filter(Boolean).join(' + ')}`}>
                        {' '}
                        · other hardware
                      </span>
                    )}
                    <span className="calacts">
                      <button className="linkbtn" title="Set up the test, then log the result" onClick={() => onCalibrate(t.test, c)}>
                        Calibrate
                      </button>
                      {(!entry || other) && (
                        <button className="linkbtn" title="Log the value in the preset now as good, so this test is no longer due" onClick={accept}>
                          Value is OK
                        </button>
                      )}
                    </span>
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

/** Copies a text, such as G-code, and says so for a moment. */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="linkbtn small"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          },
          () => undefined,
        )
      }
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

/**
 * Calibrate one test on one nozzle: pick a method, see what to set up in
 * Orca or the outside tool, then enter the result. Saving logs it, and can
 * set it in the preset for this nozzle.
 */
export function CalibrateDialog({
  filament,
  test,
  column,
  printer,
  data,
  def,
  canApply,
  onSave,
  onClose,
}: {
  filament: string;
  test: CalibrationTest;
  column: Column;
  /** The printer preset's values in effect for this nozzle. */
  printer: Record<string, OrcaValue | undefined>;
  data: SideFinData;
  /** The Orca setting the result goes into. */
  def?: SettingDef;
  /** The nozzle has a user preset to change. */
  canApply: boolean;
  onSave: (entry: Calibration, apply: boolean) => void;
  onClose: () => void;
}) {
  const dialog = useModal();
  const info = TESTS.find((t) => t.test === test)!;
  const methods = methodsFor(test);
  const values = Object.fromEntries(Object.entries(column.resolved.values).map(([k, v]) => [k, v.value]));
  const [methodId, setMethodId] = useState(lastMethod(data, test, methods.map((m) => m.id)) ?? methods[0].id);
  const method = methodById(methodId)!;
  const now = num(values[info.key]);
  const [value, setValue] = useState('');
  const [modifier, setModifier] = useState('');
  const [temperature, setTemperature] = useState(test === 'maxflow' ? String(num(values.nozzle_temperature) ?? '') : '');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [apply, setApply] = useState(canApply);
  const lines = setup(method, { nozzle: column.nozzle, filament: values, printer });
  const checked = value.trim() ? checkItem(def, value) : undefined;
  const error = checked && 'error' in checked ? checked.error : undefined;
  const temp = temperature.trim() ? Number(temperature) : undefined;
  const tempError = temp !== undefined && !(temp > 0 && temp < 600) ? 'Enter the temperature in \u00b0C.' : undefined;
  const ok = !!checked && !error && !tempError && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const save = () => {
    if (!ok || !checked || 'error' in checked) return;
    onSave(
      {
        filament,
        ...(column.nozzle ? { nozzle: column.nozzle } : {}),
        test,
        date,
        value: checked.value,
        ...(temp !== undefined ? { temperature: temp } : {}),
        ...(data.hardware ? { hardware: data.hardware } : {}),
        method: method.id,
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      apply && canApply,
    );
  };
  return (
    <dialog ref={dialog} className="editor calibrate" onClose={onClose} onCancel={onClose}>
      <h3>
        {info.label} · {column.label}
      </h3>
      <p className="muted small">
        {filament} · now {now !== undefined ? fmt(now) : 'not set'} · {data.hardware ? `${data.hardware.hotend} + ${data.hardware.extruder}` : 'hardware not set'}
      </p>
      <div className="methods" role="radiogroup" aria-label="Method">
        {methods.map((m) => (
          <label key={m.id} className="check">
            <input type="radio" name="method" checked={m.id === methodId} onChange={() => setMethodId(m.id)} />
            {m.label}
          </label>
        ))}
      </div>
      <ol className="small steps">
        {method.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {method.url && (
        <p className="small">
          <a href={method.url} target="_blank" rel="noreferrer">
            Open {method.label.replace(/^Orca: /, '')}
          </a>{' '}
          <span className="muted">(new tab)</span>
        </p>
      )}
      {lines.length > 0 && (
        <table className="setup small">
          <tbody>
            {lines.map((l) =>
              l.code ? (
                <tr key={l.label}>
                  <td className="muted">{l.label}</td>
                  <td>
                    <pre className="code">{l.value}</pre>
                    <CopyButton text={l.value} />
                    {l.note && <span className="muted note"> {l.note}</span>}
                  </td>
                </tr>
              ) : (
                <tr key={l.label}>
                  <td className="muted">{l.label}</td>
                  <td>
                    <span className="v">{l.value}</span>
                    {l.note && <span className="muted note"> · {l.note}</span>}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
      <div className="fields">
        {method.id === 'orca-em' && (
          <label>
            <span className="lbl">Block modifier (optional)</span>
            <input
              value={modifier}
              placeholder="e.g. -5 or 2"
              onChange={(e) => {
                setModifier(e.target.value);
                const m = Number(e.target.value);
                if (e.target.value.trim() && Number.isFinite(m)) setValue(fmt(orcaFlowRatio(now ?? 1, m)));
              }}
            />
          </label>
        )}
        <label>
          <span className="lbl">Result</span>
          <input value={value} placeholder={def?.unit ? def.unit : 'value'} onChange={(e) => setValue(e.target.value)} autoFocus />
        </label>
        {error && <p className="error small">{error}</p>}
        {test === 'maxflow' && (
          <label>
            <span className="lbl">At nozzle temperature</span>
            <input value={temperature} placeholder="°C" onChange={(e) => setTemperature(e.target.value)} />
          </label>
        )}
        {tempError && <p className="error small">{tempError}</p>}
        <label>
          <span className="lbl">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span className="lbl">Note</span>
          <textarea rows={2} value={note} placeholder="what you saw, spool, ..." onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={apply && canApply} disabled={!canApply} onChange={(e) => setApply(e.target.checked)} />
        {canApply ? `Also set ${info.label.toLowerCase()} in the preset for the ${column.label.toLowerCase()}` : 'This nozzle has no preset of yours to change'}
      </label>
      <div className="actions">
        <button className="primary" onClick={save} disabled={!ok}>
          Save to the log
        </button>
        <button className="ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
