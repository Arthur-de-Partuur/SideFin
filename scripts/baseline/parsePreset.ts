// Reads which settings each kind of preset stores, from src/libslic3r/Preset.cpp
// (s_Preset_print_options, s_Preset_filament_options, s_Preset_printer_options,
// s_Preset_machine_limits_options) and the per-extruder keys in PrintConfig.cpp.

import type { PresetKind } from '../../src/core/types';
import { balanced, stripComments } from './cpp';

function readList(src: string, name: string): string[] {
  const m = new RegExp(`\\b${name}\\s*=?\\s*\\{`).exec(src);
  if (!m) return [];
  const block = balanced(src, m.index + m[0].length - 1);
  if (!block) return [];
  return [...block.inner.matchAll(/"([A-Za-z0-9_]+)"/g)].map((x) => x[1]);
}

export function parsePresetKeys(presetCpp: string, printConfigCpp: string): Record<PresetKind, string[]> {
  const p = stripComments(presetCpp);
  const nozzle = readList(stripComments(printConfigCpp), 'm_extruder_option_keys');
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    process: uniq(readList(p, 's_Preset_print_options')),
    filament: uniq(readList(p, 's_Preset_filament_options')),
    printer: uniq([
      ...readList(p, 's_Preset_printer_options'),
      ...readList(p, 's_Preset_machine_limits_options'),
      ...nozzle,
    ]),
  };
}
