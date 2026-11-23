// Reads where Orca shows each setting: tab (printer/filament/process), page and
// group, in Orca's own order, from src/slic3r/GUI/Tab.cpp.

import type { PresetKind } from '../../src/core/types';
import { readStringExpr, stripComments } from './cpp';

export interface UiPlace {
  tab: PresetKind;
  page: string;
  group: string;
  order: number;
}

/** Functions that build the settings pages, and the tab they belong to. */
const BUILDERS: Record<string, PresetKind> = {
  'TabPrint::build': 'process',
  'TabFilament::build': 'filament',
  'TabFilament::add_filament_overrides_page': 'filament',
  'TabPrinter::build_fff': 'printer',
  'TabPrinter::build_kinematics_page': 'printer',
  'TabPrinter::build_unregular_pages': 'printer',
};

const CALL = /append_single_option_line|append_option_line|get_option\s*\(|append_option\s*\(|create_single_option_line/;
const PAGE = /add_options_page\(\s*(L\("(?:[^"\\]|\\.)*"\)|page_name)/;
const GROUP = /new_optgroup\(\s*(L\("(?:[^"\\]|\\.)*"\)|"(?:[^"\\]|\\.)*")/;
const VECTOR = /std::vector\s*<\s*std::string\s*>\s*\w+\s*[{=]/;

export function parseTab(source: string, knownKeys: Set<string>): Record<string, UiPlace> {
  const src = stripComments(source);
  const fnRe = /^[\w:<>&*\s]*?\b(Tab\w+)::(\w+)\s*\([^)]*\)\s*(?:const\s*)?\{?\s*$/gm;
  const starts = [...src.matchAll(fnRe)].map((m) => ({ name: `${m[1]}::${m[2]}`, index: m.index! }));

  const sure: Record<string, UiPlace> = {}; // seen in a call that adds the field
  const maybe: Record<string, UiPlace> = {}; // other mentions in the page builders
  let order = 0;
  const place = (target: Record<string, UiPlace>, key: string, tab: PresetKind, page: string, group: string) => {
    if (!page || key in target) return;
    target[key] = { tab, page, group, order: order++ };
  };

  starts.forEach((fn, i) => {
    const tab = BUILDERS[fn.name];
    if (!tab) return;
    const body = src.slice(fn.index, i + 1 < starts.length ? starts[i + 1].index : undefined);
    let page = '';
    let group = '';
    let pending: string[] = []; // keys listed in a vector, shown in the next group
    let inVector = false;

    for (const line of body.split('\n')) {
      const p = line.match(PAGE);
      if (p) {
        page = p[1] === 'page_name' ? 'Extruder' : readStringExpr(p[1]) ?? page;
        group = '';
      }
      const g = line.match(GROUP);
      if (g) {
        group = readStringExpr(g[1]) ?? group;
        for (const k of pending) place(maybe, k, tab, page, group);
        pending = [];
      }
      const keys = [...line.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
      if (VECTOR.test(line)) inVector = true;
      if (inVector) {
        pending.push(...keys.filter((k) => knownKeys.has(k)));
        if (line.includes('}')) inVector = false;
        continue;
      }
      if (CALL.test(line)) {
        for (const k of keys) if (knownKeys.has(k)) place(sure, k, tab, page, group);
        // "machine_max_acceleration_" + axis  ->  _x, _y, _z, _e
        for (const m of line.matchAll(/"([a-z0-9_]+_)"\s*\+\s*\w+/g)) {
          for (const k of knownKeys) if (k.startsWith(m[1]) && /^[xyze]$/.test(k.slice(m[1].length))) place(sure, k, tab, page, group);
        }
        // a loop over a vector of keys:  append_option_line(optgroup, speed_axis, ...)
      } else {
        for (const k of keys) if (knownKeys.has(k)) place(maybe, k, tab, page, group);
      }
    }
  });

  const out: Record<string, UiPlace> = { ...maybe, ...sure };
  // Keep Orca's order: sort by first appearance.
  return Object.fromEntries(Object.entries(out).sort((a, b) => a[1].order - b[1].order));
}
