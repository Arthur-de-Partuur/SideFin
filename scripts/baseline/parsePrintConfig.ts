// Reads every setting definition from OrcaSlicer's src/libslic3r/PrintConfig.cpp:
// key, type, label, tooltip, unit, Simple/Advanced/Expert/Develop level, limits,
// enum values and the built-in default, written the way Orca writes profile JSON.

import type { SettingDef, SettingMode } from '../../src/core/types';
import {
  balanced,
  fmtNumber,
  readNumber,
  readStringExpr,
  splitTopLevel,
  stripComments,
} from './cpp';

export interface PrintConfigParse {
  settings: Record<string, SettingDef>;
  /** Keys whose default could not be read; listed in the build report. */
  unparsedDefaults: string[];
}

const MODES: Record<string, SettingMode> = {
  comSimple: 'simple',
  comAdvanced: 'advanced',
  comExpert: 'expert',
  comDevelop: 'develop',
};

/** s_keys_map_X tables: enum identifier -> the string Orca writes in JSON. */
export function readEnumMaps(src: string): Record<string, Record<string, string>> {
  const maps: Record<string, Record<string, string>> = {};
  const re = /t_config_enum_values\s+s_keys_map_(\w+)\s*=?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const body = balanced(src, m.index + m[0].length - 1);
    if (!body) continue;
    const map: Record<string, string> = {};
    for (const e of body.inner.matchAll(/\{\s*"([^"]*)"\s*,\s*(?:int\s*\(\s*)?([\w:]+)\s*\)?\s*\}/g)) {
      const ident = e[2].replace(/^.*::/, '');
      if (!(ident in map)) map[ident] = e[1]; // first name wins (later ones are legacy aliases)
    }
    maps[m[1]] = map;
  }
  return maps;
}

function args(inner: string): string[] {
  const t = inner.trim();
  if (t === '') return [];
  return splitTopLevel(t, ',').map((a) => a.trim());
}

/** Unwrap std::vector<double>{...}, {...}, (...) around a list. */
function listItems(expr: string): string[] {
  let e = expr.trim();
  for (;;) {
    const w = e.match(/^(?:std::vector\s*<[^>]*>|std::initializer_list\s*<[^>]*>)?\s*([({])([\s\S]*)([)}])$/);
    if (!w) break;
    const inner = w[2].trim();
    const items = args(inner);
    if (items.length === 1 && /^(?:std::vector|\{|\()/.test(items[0])) {
      e = items[0];
      continue;
    }
    return items;
  }
  return args(e);
}

function str(v: string): string | undefined {
  const t = v.trim();
  if (t === '' || t === 'std::string()' || t === '""') return '';
  const m = t.match(/^std::string\s*\(([\s\S]*)\)$/);
  return readStringExpr(m ? m[1] : t);
}

function point(v: string): string | undefined {
  const m = v.match(/^Vec2d\s*\(([^)]*)\)$/) ?? v.match(/^\{([^}]*)\}$/);
  if (!m) return undefined;
  const xy = args(m[1]).map(readNumber);
  if (xy.length !== 2 || xy.some((x) => x === undefined)) return undefined;
  return `${fmtNumber(xy[0]!)}x${fmtNumber(xy[1]!)}`;
}

function floatOrPercent(v: string): string | undefined {
  const m = v.match(/^(?:FloatOrPercent)?\s*[({]([^)}]*)[)}]$/);
  const a = m ? args(m[1]) : args(v);
  if (a.length !== 2) return undefined;
  const num = readNumber(a[0]);
  const pct = readNumber(a[1]);
  if (num === undefined || pct === undefined) return undefined;
  return pct ? `${fmtNumber(num)}%` : fmtNumber(num);
}

/**
 * Turn `new ConfigOptionX(...)` into Orca's JSON form: a string for single
 * values, an array of strings for vector types. Undefined when unreadable.
 */
export function readDefault(
  expr: string,
  enumMaps: Record<string, Record<string, string>>,
  enumKeysMap: string | undefined,
  constants: Record<string, string> = {},
): string | string[] | undefined {
  expr = expr.replace(/\b[A-Z][A-Z0-9_]{3,}\b/g, (c) => constants[c] ?? c);
  // Nullable lists that start empty: Orca writes "nil".
  expr = expr.replace(/ConfigOption\w+Nullable::nil_value\(\s*\)/g, '"nil"');
  const m = expr.trim().match(/^new\s+(ConfigOption\w+?)(Nullable)?\s*(?:<\s*(\w+)\s*>)?\s*([({][\s\S]*[)}])$/);
  if (!m) return undefined;
  const cls = m[1];
  const enumType = m[3];
  const inner = m[4].slice(1, -1);
  const a = args(inner);
  const num = (t: string) => {
    const x = readNumber(t);
    return x === undefined ? undefined : fmtNumber(x);
  };
  const all = <T>(xs: (T | undefined)[]): T[] | undefined => (xs.some((x) => x === undefined) ? undefined : (xs as T[]));

  switch (cls) {
    case 'ConfigOptionFloat':
    case 'ConfigOptionInt':
      return a.length === 1 ? num(a[0]) : undefined;
    case 'ConfigOptionBool': {
      const x = a.length === 1 ? readNumber(a[0]) : undefined;
      return x === undefined ? undefined : x ? '1' : '0';
    }
    case 'ConfigOptionPercent': {
      const x = a.length === 1 ? num(a[0]) : undefined;
      return x === undefined ? undefined : `${x}%`;
    }
    case 'ConfigOptionFloatOrPercent':
      return a.length === 2 ? floatOrPercent(`(${inner})`) : undefined;
    case 'ConfigOptionString':
      return a.length <= 1 ? str(inner) : str(inner);
    case 'ConfigOptionPoint':
      // One point is written "x,y"; in a list of points each is "XxY" (Config.hpp serialize).
      return a.length === 1 ? point(a[0])?.replace('x', ',') : undefined;
    case 'ConfigOptionEnum': {
      if (!enumType || a.length !== 1) return undefined;
      const ident = a[0].replace(/^.*::/, '');
      const map = enumMaps[enumType] ?? (enumKeysMap ? enumMaps[enumKeysMap] : undefined);
      return map?.[ident];
    }
    case 'ConfigOptionFloats':
    case 'ConfigOptionInts':
      return all(listItems(inner).map((t) => (t === '"nil"' ? 'nil' : num(t))));
    case 'ConfigOptionEnumsGeneric': {
      const map = enumKeysMap ? enumMaps[enumKeysMap] : undefined;
      if (!map) return undefined;
      return all(listItems(inner).map((t) => map[t.replace(/^\(int\)\s*/, '').replace(/^.*::\s*/, '').trim()]));
    }
    case 'ConfigOptionPercents':
      return all(listItems(inner).map((t) => {
        if (t === '"nil"') return 'nil';
        const x = num(t);
        return x === undefined ? undefined : `${x}%`;
      }));
    case 'ConfigOptionBools':
      return all(listItems(inner).map((t) => {
        const x = readNumber(t);
        return x === undefined ? undefined : x ? '1' : '0';
      }));
    case 'ConfigOptionStrings':
      return all(listItems(inner).map(str));
    case 'ConfigOptionPoints':
      return all(listItems(inner).map(point));
    case 'ConfigOptionFloatsOrPercents':
      return all(listItems(inner).map(floatOrPercent));
    default:
      return undefined;
  }
}

function field(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`def->${name}\\s*=\\s*([\\s\\S]*?);\\s*(?:\\n|$)`));
  return m ? m[1] : undefined;
}

/** #define NAME value  lines from PrintConfigConstants.hpp. */
export function readConstants(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of stripComments(header).matchAll(/^\s*#define\s+(\w+)\s+(.+?)\s*$/gm)) out[m[1]] = m[2];
  return out;
}

export function parsePrintConfig(source: string, constants: Record<string, string> = {}): PrintConfigParse {
  const src = stripComments(source);
  const enumMaps = readEnumMaps(src);

  // Setting definitions live in init_common_params() and init_fff_params().
  const start = src.indexOf('void PrintConfigDef::init_common_params()');
  const end = src.indexOf('void PrintConfigDef::init_extruder_option_keys()');
  const body = src.slice(start < 0 ? 0 : start, end < 0 ? undefined : end);

  const settings: Record<string, SettingDef> = {};
  const unparsedDefaults: string[] = [];
  const re = /def\s*=\s*this->add(_nullable)?\(\s*"([^"]+)"\s*,\s*(\w+)\s*\)\s*;/g;
  const hits = [...body.matchAll(re)];
  hits.forEach((h, i) => {
    const block = body.slice(h.index! + h[0].length, i + 1 < hits.length ? hits[i + 1].index : undefined);
    const key = h[2];
    const def: SettingDef = { key, type: h[3], mode: 'simple' };
    if (h[1]) def.nullable = true;

    const label = field(block, 'label');
    if (label) def.label = readStringExpr(label);
    const full = field(block, 'full_label');
    if (full) def.fullLabel = readStringExpr(full);
    const cat = field(block, 'category');
    if (cat) def.category = readStringExpr(cat);
    const tip = field(block, 'tooltip');
    if (tip) def.tooltip = readStringExpr(tip);
    const side = field(block, 'sidetext');
    if (side) def.unit = readStringExpr(side);
    const mode = block.match(/def->mode\s*=\s*(com\w+)/);
    if (mode && MODES[mode[1]]) def.mode = MODES[mode[1]];
    const min = field(block, 'min');
    if (min !== undefined && readNumber(min) !== undefined) def.min = readNumber(min);
    const max = field(block, 'max');
    if (max !== undefined && readNumber(max) !== undefined) def.max = readNumber(max);
    if (/def->readonly\s*=\s*true/.test(block)) def.readonly = true;

    const ev = [...block.matchAll(/def->enum_values\.(?:push_back|emplace_back)\(\s*"([^"]*)"\s*\)/g)].map((x) => x[1]);
    if (ev.length) def.enumValues = ev;
    const el = [...block.matchAll(/def->enum_labels\.(?:push_back|emplace_back)\(\s*([^;]*?)\s*\)\s*;/g)]
      .map((x) => readStringExpr(x[1]) ?? '');
    if (el.length) def.enumLabels = el;
    const ekm = block.match(/def->enum_keys_map\s*=\s*&?\s*(?:ConfigOptionEnum\s*<\s*(\w+)\s*>::get_enum_values\(\)|s_keys_map_(\w+))/);
    const enumKeysMap = ekm ? ekm[1] ?? ekm[2] : undefined;

    const sdv = block.indexOf('set_default_value');
    if (sdv >= 0) {
      const open = block.indexOf('(', sdv);
      const b = balanced(block, open);
      const val = b ? readDefault(b.inner, enumMaps, enumKeysMap, constants) : undefined;
      if (val !== undefined) def.default = val;
      else {
        def.defaultSource = b?.inner.trim();
        unparsedDefaults.push(key);
      }
    } else {
      unparsedDefaults.push(key);
    }
    settings[key] = def;
  });

  // Machine limits per axis are defined in a loop over x, y, z, e.
  const axesAt = body.indexOf('std::vector<AxisDefault> axes');
  if (axesAt >= 0) {
    const open = body.indexOf('{', axesAt);
    const list = balanced(body, open);
    const loopAt = body.indexOf('for (const AxisDefault', axesAt);
    const loopOpen = body.indexOf('{', loopAt);
    const loop = loopAt >= 0 ? balanced(body, loopOpen) : undefined;
    if (list && loop) {
      const axes = [...list.inner.matchAll(/\{\s*"(\w)"\s*,\s*\{([^}]*)\}\s*,\s*\{([^}]*)\}\s*,\s*\{([^}]*)\}\s*\}/g)].map((a) => ({
        name: a[1],
        max_feedrate: a[2],
        max_acceleration: a[3],
        max_jerk: a[4],
      }));
      const parts = loop.inner.split(/def\s*=\s*this->add\(/).slice(1);
      for (const part of parts) {
        const head = part.match(/^\s*"(\w+)"\s*\+\s*axis\.name\s*,\s*(\w+)\s*\)/);
        if (!head) continue;
        const fieldName = part.match(/axis\.(max_\w+)/)?.[1] as 'max_feedrate' | 'max_acceleration' | 'max_jerk' | undefined;
        const fullFmt = part.match(/def->full_label\s*=\s*\(boost::format\("([^"]*)"\)/)?.[1];
        const tipFmt = part.match(/def->tooltip\s*=\s*\(boost::format\("([^"]*)"\)/)?.[1];
        const cat = field(part, 'category');
        const side = field(part, 'sidetext');
        const mode = part.match(/def->mode\s*=\s*(com\w+)/)?.[1];
        const min = field(part, 'min');
        for (const ax of axes) {
          const key = head[1] + ax.name;
          const up = ax.name.toUpperCase();
          const vals = fieldName ? args(ax[fieldName]).map((x) => readNumber(x)) : [];
          settings[key] = {
            key,
            type: head[2],
            mode: (mode && MODES[mode]) || 'simple',
            label: fullFmt?.replace('%1%', up),
            fullLabel: fullFmt?.replace('%1%', up),
            tooltip: tipFmt?.replace('%1%', up),
            category: cat ? readStringExpr(cat) : undefined,
            unit: side ? readStringExpr(side) : undefined,
            min: min !== undefined ? readNumber(min) : undefined,
            default: vals.every((v) => v !== undefined) ? vals.map((v) => fmtNumber(v!)) : undefined,
          };
        }
      }
    }
  }

  // filament_* overrides are cloned from the printer's extruder settings.
  const ov = src.match(/filament_extruder_override_keys\s*=\s*\{([\s\S]*?)\};/);
  if (ov) {
    const simple = new Set([
      'filament_retraction_length',
      'filament_z_hop',
      'filament_long_retractions_when_cut',
      'filament_retraction_distances_when_cut',
    ]);
    for (const k of ov[1].matchAll(/"([^"]+)"/g)) {
      const key = k[1];
      const base = settings[key.replace(/^filament_/, '')];
      if (!base || settings[key]) continue;
      settings[key] = {
        ...base,
        key,
        nullable: true,
        mode: simple.has(key) ? 'simple' : 'advanced',
        overrides: base.key,
      };
      const i = unparsedDefaults.indexOf(key);
      if (i >= 0) unparsedDefaults.splice(i, 1);
    }
  }

  return { settings, unparsedDefaults };
}
