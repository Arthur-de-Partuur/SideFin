import { describe, expect, it } from 'vitest';
import { warningFor } from './warnings';
import type { SettingDef } from './types';

const def = (type: string): SettingDef => ({ key: 'x', type, mode: 'simple' });

describe('warningFor', () => {
  it('warns when a number is more than 50% from the default', () => {
    expect(warningFor('outer_wall_speed', def('coFloat'), '200', '100', { values: {} })).toMatch(/100% higher/);
    expect(warningFor('outer_wall_speed', def('coFloat'), '140', '100', { values: {} })).toBeUndefined();
    expect(warningFor('sparse_infill_density', def('coPercent'), '5%', '20%', { values: {} })).toMatch(/75% lower/);
  });
  it('does not compare 0, text or a percentage with a number', () => {
    expect(warningFor('brim_width', def('coFloat'), '0', '5', { values: {} })).toBeUndefined();
    expect(warningFor('notes', def('coString'), 'a', 'b', { values: {} })).toBeUndefined();
    expect(warningFor('outer_wall_line_width', def('coFloatOrPercent'), '0.45', '110%', { values: {}, nozzle: '0.4' })).toBeUndefined();
  });
  it('checks line widths against the nozzle', () => {
    expect(warningFor('line_width', def('coFloatOrPercent'), '0.2', '0.2', { values: {}, nozzle: '0.4' })).toMatch(/50% of the 0.4 mm nozzle/);
    expect(warningFor('line_width', def('coFloatOrPercent'), '250%', '250%', { values: {}, nozzle: '0.4' })).toMatch(/over 200%/);
    expect(warningFor('line_width', def('coFloatOrPercent'), '0.45', '0.45', { values: {}, nozzle: '0.4' })).toBeUndefined();
  });
  it("checks nozzle temperatures against the filament's range", () => {
    const values = { nozzle_temperature_range_low: ['190'], nozzle_temperature_range_high: ['240'] };
    expect(warningFor('nozzle_temperature', def('coInts'), ['250'], ['250'], { values })).toMatch(/above this filament's range \(190–240/);
    expect(warningFor('nozzle_temperature_initial_layer', def('coInts'), ['180'], ['180'], { values })).toMatch(/below/);
    expect(warningFor('nozzle_temperature', def('coInts'), ['220'], ['220'], { values })).toBeUndefined();
  });
});

describe('warningFor, what it leaves out', () => {
  it('does not compare line widths with the default, nor negative "automatic" values', () => {
    expect(warningFor('inner_wall_line_width', def('coFloatOrPercent'), '0.65', '0.4', { values: {}, nozzle: '0.6' })).toBeUndefined();
    expect(warningFor('support_material_interface_fan_speed', def('coInts'), ['50'], ['-1'], { values: {} })).toBeUndefined();
  });
});
