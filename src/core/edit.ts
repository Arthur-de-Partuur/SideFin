// Changing a value of a user preset, checking it the way Orca would, and
// writing the preset back as Orca writes it.

import type { Baseline, OrcaValue, ProfileJson, SettingDef } from './types';

/** Profile keys that describe the file rather than a setting; never dropped. */
const META = new Set(['name', 'inherits', 'type', 'from', 'instantiation', 'setting_id', 'filament_id', 'base_id', 'version', 'is_custom_defined', 'renamed_from', 'print_settings_id', 'filament_settings_id', 'printer_settings_id', 'compatible_printers', 'compatible_printers_condition', 'compatible_prints', 'compatible_prints_condition']);

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

/** The kind of value one item of a list setting holds. Points in a list are written 0x0, a single point 0,0. */
const ITEM: Record<string, string> = {
  coBools: 'coBool',
  coEnums: 'coEnum',
  coInts: 'coInt',
  coFloats: 'coFloat',
  coPercents: 'coPercent',
  coFloatsOrPercents: 'coFloatOrPercent',
  coStrings: 'coString',
  coPoints: 'coPointItem',
  coPointsGroups: 'coString',
};

function itemType(def?: SettingDef): string {
  const t = def?.type ?? 'coString';
  return ITEM[t] ?? t;
}

/**
 * Check one item as typed and return it in the form Orca stores, or the reason
 * Orca would not accept it.
 */
export function checkItem(def: SettingDef | undefined, input: string): { value: string } | { error: string } {
  const t = itemType(def);
  const text = t === 'coString' ? input : input.trim();
  if (def?.nullable && text === 'nil') return { value: text };
  const range = (n: number, unit = '') => {
    if (def?.min !== undefined && n < def.min) return { error: `The lowest value Orca allows is ${def.min}${unit}.` };
    if (def?.max !== undefined && n > def.max) return { error: `The highest value Orca allows is ${def.max}${unit}.` };
    return undefined;
  };
  switch (t) {
    case 'coBool':
      return text === '0' || text === '1' ? { value: text } : { error: 'Choose yes or no.' };
    case 'coEnum':
      return def?.enumValues && !def.enumValues.includes(text) ? { error: 'Choose one of the listed options.' } : { value: text };
    case 'coInt': {
      if (!/^[-+]?\d+$/.test(text)) return { error: 'Type a whole number.' };
      return range(Number(text)) ?? { value: String(Number(text)) };
    }
    case 'coFloat': {
      if (!NUMBER.test(text)) return { error: 'Type a number, with a point for decimals (0.4).' };
      return range(Number(text)) ?? { value: text.replace(/^\+/, '') };
    }
    case 'coPercent': {
      const n = text.replace(/%$/, '');
      if (!NUMBER.test(n)) return { error: 'Type a percentage, such as 15%.' };
      return range(Number(n), '%') ?? { value: `${n}%` };
    }
    case 'coFloatOrPercent': {
      const pct = text.endsWith('%');
      const n = pct ? text.slice(0, -1) : text;
      if (!NUMBER.test(n)) return { error: 'Type a number (0.45) or a percentage of the nozzle size (110%).' };
      return range(Number(n)) ?? { value: text };
    }
    case 'coPoint':
      return /^-?\d*\.?\d+\s*[,x]\s*-?\d*\.?\d+$/.test(text) ? { value: text.replace(/\s/g, '') } : { error: 'Type a point as x,y, such as 0,0.' };
    case 'coPointItem':
      return /^-?\d*\.?\d+x-?\d*\.?\d+$/.test(text) ? { value: text } : { error: 'Type a point as XxY, such as 0x0.' };
    default:
      return { value: text };
  }
}

/** Check every item; the first error found wins. */
export function checkItems(def: SettingDef | undefined, inputs: string[]): { items: string[] } | { error: string; index: number } {
  const items: string[] = [];
  for (const [index, input] of inputs.entries()) {
    const r = checkItem(def, input);
    if ('error' in r) return { error: r.error, index };
    items.push(r.value);
  }
  return { items };
}

/** Where a shown value sits in the stored value: settings with one value per extruder variant store all variants in one list. */
export interface Slice {
  /** The value in effect before picking the variant. */
  full: OrcaValue | undefined;
  /** Index of the printer's variant, and how many items each variant has. */
  index: number;
  width: number;
}

/**
 * The preset with one setting changed. The new items replace the shown value,
 * keeping its shape (one value or a list); for a per-variant setting only the
 * printer's variant is replaced.
 */
export function setValue(json: ProfileJson, key: string, items: string[], shown: OrcaValue | undefined, slice?: Slice): ProfileJson {
  let value: OrcaValue = Array.isArray(shown) || shown === undefined && items.length > 1 ? items : items[0];
  if (slice && Array.isArray(slice.full)) {
    const full = [...slice.full];
    full.splice(slice.index * slice.width, slice.width, ...items);
    value = full;
  }
  return { ...json, [key]: value };
}

/** The preset without its own value for a setting, so the value is inherited again. */
export function clearValue(json: ProfileJson, key: string): ProfileJson {
  const { [key]: _gone, ...rest } = json;
  return rest as ProfileJson;
}

/** Settings stored in the preset that this Orca version does not know; Orca ignores them. */
export function obsoleteKeys(baseline: Baseline, json: ProfileJson): string[] {
  return Object.keys(json).filter((k) => !META.has(k) && !(k in baseline.settings));
}

/** The preset as Orca saves it: keys in alphabetical order, four spaces indent. */
export function orcaJson(json: ProfileJson, drop: string[] = []): string {
  const keys = Object.keys(json).filter((k) => !drop.includes(k)).sort();
  return JSON.stringify(Object.fromEntries(keys.map((k) => [k, json[k]])), null, 4) + '\n';
}

/** Keys whose value differs between the original preset and the edited one. */
export function changedKeys(before: ProfileJson, after: ProfileJson): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}
