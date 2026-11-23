import { describe, expect, it } from 'vitest';
import { compareVersions, releaseTags } from './build';
import { parsePresetKeys } from './parsePreset';
import { readStringExpr, stripComments } from './cpp';

describe('releaseTags', () => {
  it('keeps releases only, newest first', () => {
    const out = 'abc\trefs/tags/v2.4.2\nabc\trefs/tags/v2.5.0-beta\nabc\trefs/tags/v2.10.0\nabc\trefs/tags/v2.5.2\nabc\trefs/tags/v2.5.2^{}';
    expect(releaseTags(out)).toEqual(['v2.10.0', 'v2.5.2', 'v2.4.2']);
    expect(compareVersions('2.4.2', 'v2.5.2')).toBeLessThan(0);
  });
});

describe('cpp helpers', () => {
  it('removes comments but not text in strings', () => {
    expect(stripComments('a("//x"); // gone\n/* b */c')).toBe('a("//x"); \nc');
  });
  it('reads translated and joined strings', () => {
    expect(readStringExpr('L("Layer " "height")')).toBe('Layer height');
    expect(readStringExpr('_CTX("Walls", "Layers")')).toBe('Walls');
    expect(readStringExpr('some_var')).toBeUndefined();
  });
});

describe('parsePresetKeys', () => {
  it('reads the option lists of each preset kind', () => {
    const preset = `static std::vector<std::string> s_Preset_print_options{ "layer_height", /*"old",*/ "wall_loops" };
static std::vector<std::string> s_Preset_filament_options { "filament_type" };
static std::vector<std::string> s_Preset_machine_limits_options { "machine_max_speed_x" };
static std::vector<std::string> s_Preset_printer_options { "printable_area" };`;
    const pc = `m_extruder_option_keys = { "nozzle_diameter", "retraction_length" };`;
    expect(parsePresetKeys(preset, pc)).toEqual({
      process: ['layer_height', 'wall_loops'],
      filament: ['filament_type'],
      printer: ['printable_area', 'machine_max_speed_x', 'nozzle_diameter', 'retraction_length'],
    });
  });
});
