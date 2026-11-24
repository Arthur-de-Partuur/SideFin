// Builds what the viewer shows for one preset family: a column per nozzle, a
// column with the printer maker's default, and a row per setting in Orca's order.

import { familyOf, isCompatible, nozzleOf, type PresetFile } from './presets';
import { findSystemProfile, forVariant, resolvePreset, sameValue, type ResolvedPreset, type ResolvedValue } from './resolve';
import type { Baseline, OrcaValue, PresetKind, ProfileJson, SettingDef, SettingMode } from './types';

export interface PrinterEntry {
  file: PresetFile;
  nozzle?: string;
  resolved: ResolvedPreset;
}

export interface PrinterFamily {
  name: string;
  printers: PrinterEntry[];
}

export interface Family {
  kind: PresetKind;
  name: string;
  members: { nozzle?: string; file: PresetFile }[];
}

export interface Column {
  label: string;
  nozzle?: string;
  name: string;
  resolved: ResolvedPreset;
}

export interface Cell extends ResolvedValue {
  /** Differs from the printer maker's default. */
  differs: boolean;
}

export interface Row {
  key: string;
  def?: SettingDef;
  page: string;
  group: string;
  cells: Cell[];
  dflt?: ResolvedValue;
  /** The nozzle columns do not all have the same value. */
  nozzlesDiffer: boolean;
}

export type Level = 'simple' | 'advanced' | 'all';

const byNozzle = (a?: string, b?: string) => (a === undefined ? 1 : b === undefined ? -1 : Number(a) - Number(b));

function userMap(presets: PresetFile[], kind: PresetKind): Record<string, ProfileJson> {
  return Object.fromEntries(presets.filter((p) => p.kind === kind).map((p) => [p.json.name, p.json]));
}

/** The user's printers, grouped by name without the nozzle size. */
export function printerFamilies(baseline: Baseline, presets: PresetFile[]): PrinterFamily[] {
  const users = userMap(presets, 'printer');
  const map = new Map<string, PrinterEntry[]>();
  for (const file of presets.filter((p) => p.kind === 'printer')) {
    const resolved = resolvePreset(baseline, 'printer', file.json, users);
    const entry = { file, resolved, nozzle: nozzleOf('printer', file.json, resolved.values.nozzle_diameter?.value) };
    const name = familyOf(file.json.name);
    map.set(name, [...(map.get(name) ?? []), entry]);
  }
  return [...map.entries()]
    .map(([name, printers]) => ({ name, printers: printers.sort((a, b) => byNozzle(a.nozzle, b.nozzle)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function printerInfo(p: PrinterEntry) {
  const notes = p.resolved.values.printer_notes?.value;
  return { name: p.file.json.name, notes: typeof notes === 'string' ? notes : '', nozzle: p.nozzle, inherits: p.file.json.inherits };
}

/**
 * Filament or process families that fit the chosen printers. For the printer
 * kind it is the printer family itself. Without printers, every preset is listed.
 */
export function families(presets: PresetFile[], kind: PresetKind, printers?: PrinterFamily): Family[] {
  const map = new Map<string, Family['members']>();
  for (const file of presets.filter((p) => p.kind === kind)) {
    if (kind === 'printer' && printers && !printers.printers.some((p) => p.file === file)) continue;
    if (kind !== 'printer' && printers && !printers.printers.some((p) => isCompatible(file.json, printerInfo(p)))) continue;
    const name = familyOf(file.json.name);
    const nozzle = kind === 'printer' ? printers?.printers.find((p) => p.file === file)?.nozzle : nozzleOf(kind, file.json);
    map.set(name, [...(map.get(name) ?? []), { nozzle, file }]);
  }
  return [...map.entries()]
    .map(([name, members]) => ({ kind, name, members: members.sort((a, b) => byNozzle(a.nozzle, b.nozzle)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The extruder variant Orca uses with a printer, e.g. "Direct Drive Standard". */
function variantOf(printers: PrinterFamily | undefined, nozzle?: string): string | undefined {
  const p = printers?.printers.find((x) => x.nozzle === nozzle) ?? printers?.printers[0];
  const v = p?.resolved.values.printer_extruder_variant?.value;
  return Array.isArray(v) ? v[0] : v;
}

export function nozzleLabel(nozzle?: string): string {
  return nozzle === undefined ? 'All nozzles' : `${Number(nozzle).toFixed(2)} nozzle`;
}

/** Vendor folder names as people write them. */
const MAKERS: Record<string, string> = { Ratrig: 'RatRig', OrcaFilamentLibrary: 'Orca library' };

/** Header for the default column, e.g. "RatRig default". */
export function defaultLabel(dflt?: Column): string {
  const vendor = dflt?.resolved.chain[0]?.vendor;
  return vendor ? `${MAKERS[vendor] ?? vendor} default` : 'Default';
}

/** One column per member, plus the printer maker's default: the system preset the first member inherits from. */
export function columnsFor(
  baseline: Baseline,
  family: Family,
  presets: PresetFile[],
  printers?: PrinterFamily,
): { columns: Column[]; dflt?: Column; parents: string[] } {
  const users = userMap(presets, family.kind);
  const withVariant = (r: ResolvedPreset, nozzle?: string) => {
    const v = variantOf(printers, nozzle);
    return v ? forVariant(r, baseline, v) : r;
  };
  const columns = family.members.map((m) => ({
    label: nozzleLabel(m.nozzle),
    nozzle: m.nozzle,
    name: m.file.json.name,
    resolved: withVariant(resolvePreset(baseline, family.kind, m.file.json, users), m.nozzle),
  }));
  const parents = [...new Set(columns.map((c) => c.resolved.chain.find((l) => l.origin === 'system')?.name).filter((x): x is string => !!x))];
  let dflt: Column | undefined;
  const first = columns[0]?.resolved.chain.find((l) => l.origin === 'system');
  if (first) {
    const sys = findSystemProfile(baseline, family.kind, first.name, first.vendor);
    if (sys) {
      dflt = {
        label: 'Default',
        nozzle: columns[0].nozzle,
        name: sys.name,
        resolved: withVariant(resolvePreset(baseline, family.kind, sys, {}, 'system'), columns[0].nozzle),
      };
    }
  }
  return { columns, dflt, parents };
}

/** Keys that name the preset itself; they always differ and say nothing. */
const SKIP = /^(inherits|print_settings_id|filament_settings_id|printer_settings_id|version)$/;

export function buildRows(baseline: Baseline, kind: PresetKind, columns: Column[], dflt?: Column): Row[] {
  const keys = new Set(baseline.presetKeys[kind]);
  for (const c of columns) for (const k of Object.keys(c.resolved.values)) keys.add(k);
  const rows: (Row & { order: number })[] = [];
  for (const key of keys) {
    if (SKIP.test(key)) continue;
    const def = baseline.settings[key];
    const d = dflt?.resolved.values[key];
    const cells = columns.map((c) => {
      const v = c.resolved.values[key] ?? { value: def?.default, from: 'default', origin: 'default' as const, own: false };
      return { ...v, differs: d ? !sameValue(v.value, d.value) : false };
    });
    const nozzlesDiffer = cells.some((c) => !sameValue(c.value, cells[0].value));
    const ui = def?.ui && def.ui.tab === kind ? def.ui : undefined;
    rows.push({
      key,
      def,
      page: ui?.page ?? 'Not shown in Orca',
      group: ui?.group ?? (def ? 'Stored in the preset, no field in Orca' : 'Not an Orca setting'),
      cells,
      dflt: d,
      nozzlesDiffer,
      order: ui ? ui.order : Number.MAX_SAFE_INTEGER,
    });
  }
  rows.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  return rows.map(({ order: _order, ...r }) => r);
}

const LEVEL_MODES: Record<Level, SettingMode[]> = {
  simple: ['simple'],
  advanced: ['simple', 'advanced'],
  all: ['simple', 'advanced', 'expert', 'develop'],
};

export interface RowFilter {
  level: Level;
  onlyDiffers?: boolean;
  onlyNozzlesDiffer?: boolean;
  search?: string;
}

export function filterRows(rows: Row[], f: RowFilter): Row[] {
  const q = f.search?.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.level !== 'all') {
      if (r.page === 'Not shown in Orca') return false;
      if (!r.def || !LEVEL_MODES[f.level].includes(r.def.mode)) return false;
    }
    if (f.onlyDiffers && !r.cells.some((c) => c.differs)) return false;
    if (f.onlyNozzlesDiffer && !r.nozzlesDiffer) return false;
    if (q) {
      const text = `${r.key} ${r.def?.label ?? ''} ${r.def?.fullLabel ?? ''} ${r.page} ${r.group}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });
}

/** Number of settings where at least one nozzle differs from the default. */
export function countDiffers(rows: Row[]): number {
  return rows.filter((r) => r.cells.some((c) => c.differs)).length;
}

export interface Shown {
  text: string;
  /** Full text when it was shortened, for a tooltip. */
  full?: string;
  /** The value is not one of the setting's choices: an old value Orca converts or ignores. */
  unknownChoice?: boolean;
  /** Text that needs more than one short line, such as G-code or notes. */
  long?: boolean;
}

/** A value as Orca shows it: choice labels, Yes/No, one value when all extruders agree. */
export function showValue(def: SettingDef | undefined, value: OrcaValue | undefined): Shown {
  if (value === undefined) return { text: '' };
  let items = Array.isArray(value) ? value : [value];
  if (items.length > 1 && items.every((x) => x === items[0])) items = [items[0]];
  let unknownChoice = false;
  const one = (x: string) => {
    if (x === 'nil') return '(printer value)';
    if (def?.type.startsWith('coBool')) return x === '1' ? 'Yes' : x === '0' ? 'No' : x;
    if (def?.enumValues?.length) {
      const i = def.enumValues.indexOf(x);
      if (i < 0) {
        unknownChoice = true;
        return x;
      }
      return def.enumLabels?.[i] || x;
    }
    return x;
  };
  const full = items.map(one).join(' / ');
  const firstLine = full.split('\n')[0];
  const short = firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
  const text = short !== full && !short.endsWith('…') ? `${short} …` : short;
  return { text: text || (full ? '…' : ''), full: text !== full ? full : undefined, unknownChoice, long: text !== full };
}
