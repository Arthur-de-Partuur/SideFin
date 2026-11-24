import { useEffect, useRef, useState } from 'react';
import { checkItems } from '../core/edit';
import { showValue, type Cell, type Column } from '../core/table';
import type { OrcaValue, SettingDef } from '../core/types';

export interface EditTarget {
  key: string;
  label: string;
  def?: SettingDef;
  column: Column;
  cell: Cell;
  dflt?: OrcaValue;
  dfltLabel: string;
  /** The setting is changed in SideFin and not exported yet. */
  edited: boolean;
  /** The preset stores one value per extruder type; only the printer's one is changed. */
  perVariant: boolean;
  /** Why a value would look odd, by SideFin's warning rules. */
  warn: (value: OrcaValue) => string | undefined;
}

const asItems = (v: OrcaValue | undefined) => (v === undefined ? [''] : Array.isArray(v) ? (v.length ? v : ['']) : [v]);

/** A dialog to change one value of one preset. */
export function Editor({
  target,
  onSave,
  onClear,
  onClose,
}: {
  target: EditTarget;
  onSave: (items: string[]) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { def, cell, column } = target;
  const items = asItems(cell.value);
  const same = items.every((x) => x === items[0]);
  const [inputs, setInputs] = useState<string[]>(same ? [items[0]] : items);
  const [error, setError] = useState<{ error: string; index: number }>();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const type = def?.type ?? 'coString';
  const isBool = type.startsWith('coBool');
  const isEnum = !!def?.enumValues?.length;
  const multiline = type.startsWith('coString') && (/gcode|notes|condition/.test(target.key) || items.some((x) => x.includes('\n')));

  const save = () => {
    const r = checkItems(def, inputs);
    if ('error' in r) {
      setError(r);
      return;
    }
    // One field for a list whose items were all the same: keep the list length.
    onSave(inputs.length === 1 && items.length > 1 ? items.map(() => r.items[0]) : r.items);
  };

  const field = (value: string, i: number) => {
    const set = (v: string) => {
      setInputs(inputs.map((x, j) => (j === i ? v : x)));
      setError(undefined);
    };
    const invalid = error?.index === i;
    if (isBool)
      return (
        <select value={value} onChange={(e) => set(e.target.value)} aria-invalid={invalid}>
          <option value="1">Yes</option>
          <option value="0">No</option>
        </select>
      );
    if (isEnum)
      return (
        <select value={value} onChange={(e) => set(e.target.value)} aria-invalid={invalid}>
          {!def!.enumValues!.includes(value) && <option value={value}>{value} (old value)</option>}
          {def!.enumValues!.map((v, j) => (
            <option key={v} value={v}>
              {def!.enumLabels?.[j] || v}
            </option>
          ))}
        </select>
      );
    if (multiline) return <textarea value={value} rows={14} spellCheck={false} onChange={(e) => set(e.target.value)} aria-invalid={invalid} />;
    return <input value={value} onChange={(e) => set(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} aria-invalid={invalid} autoFocus={i === 0} />;
  };

  const checked = checkItems(def, inputs);
  const warning = 'items' in checked ? target.warn(checked.items) : undefined;

  const range = [def?.min !== undefined ? `lowest ${def.min}` : '', def?.max !== undefined ? `highest ${def.max}` : ''].filter(Boolean).join(', ');

  return (
    <dialog ref={dialog} className={`editor${multiline ? ' wide' : ''}`} onClose={onClose} onCancel={onClose}>
      <h3>
        {target.label} <span className="muted small">{target.key}</span>
      </h3>
      <p className="muted small">
        {column.name}
        {target.perVariant && ' · only the value for the printer’s extruder type'}
      </p>
      {def?.tooltip && <p className="small">{def.tooltip}</p>}
      <div className={`fields${multiline ? ' wide' : ''}`}>
        {inputs.map((v, i) => (
          <label key={i}>
            {inputs.length > 1 && <span className="lbl">Value {i + 1}</span>}
            {field(v, i)}
            {def?.unit && !multiline && <span className="unit">{def.unit}</span>}
          </label>
        ))}
      </div>
      {inputs.length === 1 && items.length > 1 && <p className="muted small">Used for all {items.length} values of this setting, as before.</p>}
      {error && <p className="error small">{error.error}</p>}
      {!error && warning && <p className="warntext small">Warning: {warning}</p>}
      <dl className="small">
        <dt>Now</dt>
        <dd>
          {showValue(def, cell.value).text || '(empty)'}{' '}
          <span className="muted">({cell.own ? 'set in this preset' : cell.origin === 'default' ? "Orca's built-in default" : `from "${cell.from}"`})</span>
        </dd>
        <dt>{target.dfltLabel}</dt>
        <dd>{showValue(def, target.dflt).text || '(empty)'}</dd>
        {range && (
          <>
            <dt>Orca allows</dt>
            <dd>{range}</dd>
          </>
        )}
      </dl>
      <div className="actions">
        <button className="primary" onClick={save}>
          Change
        </button>
        {cell.own && (
          <button onClick={onClear} title={`Remove the value from this preset, so it comes from the preset it inherits from${target.perVariant ? ' (for all extruder types)' : ''}`}>
            Back to inherited
          </button>
        )}
        <button className="ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
      {target.edited && <p className="muted small">Changed in SideFin, not exported yet.</p>}
    </dialog>
  );
}
