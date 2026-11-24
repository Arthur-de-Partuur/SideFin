import { describe, expect, it } from 'vitest';
import { baseline } from './fixtures/baseline';
import { differences, findSystemProfile, forVariant, resolvePreset, sameValue } from './resolve';

describe('resolvePreset', () => {
  it('takes each value from the nearest profile in the chain, then the built-in default', () => {
    const r = resolvePreset(baseline, 'process', { name: 'My quality', inherits: '0.20mm Standard @Acme', layer_height: '0.16' });
    expect(r.chain.map((l) => l.name)).toEqual(['My quality', '0.20mm Standard @Acme', 'fdm_process_common']);
    expect(r.values.layer_height).toMatchObject({ value: '0.16', from: 'My quality', own: true });
    expect(r.values.wall_loops).toMatchObject({ value: '2', from: '0.20mm Standard @Acme', origin: 'system', own: false });
    expect(r.values.bridge_density).toMatchObject({ value: '100%', from: 'default', origin: 'default' });
    expect(r.problems).toEqual([]);
  });

  it('looks in the Orca filament library for a parent the vendor does not have', () => {
    const r = resolvePreset(baseline, 'filament', { name: 'My PETG', inherits: 'Generic PETG @System' });
    expect(r.chain.map((l) => l.vendor)).toEqual([undefined, 'OrcaFilamentLibrary', 'OrcaFilamentLibrary']);
    expect(r.values.filament_type.value).toEqual(['PETG']);
  });

  it('prefers the vendor of the inheriting profile when two vendors use the same name', () => {
    expect(findSystemProfile(baseline, 'filament', 'fdm_filament_pet', 'Acme')?.filament_type).toEqual(['PET']);
    expect(findSystemProfile(baseline, 'filament', 'fdm_filament_pet')?.vendor).toBe('OrcaFilamentLibrary');
  });

  it('follows user parents and reports a parent that does not exist', () => {
    const users = { 'My base': { name: 'My base', inherits: 'Gone @Acme', wall_loops: '4' } };
    const r = resolvePreset(baseline, 'process', { name: 'Child', inherits: 'My base' }, users);
    expect(r.values.wall_loops).toMatchObject({ value: '4', from: 'My base', origin: 'user' });
    expect(r.problems).toEqual(['"My base" inherits from "Gone @Acme", which was not found in Orca 9.9.9.']);
  });

  it('stops on an inheritance loop', () => {
    const users = { A: { name: 'A', inherits: 'B' }, B: { name: 'B', inherits: 'A' } };
    const r = resolvePreset(baseline, 'process', users.A, users);
    expect(r.problems[0]).toContain('loop');
  });

  it('keeps keys the preset sets even when Orca does not know them, and says so', () => {
    const r = resolvePreset(baseline, 'process', { name: 'Old', made_up_key: '1' });
    expect(r.values.made_up_key.value).toBe('1');
    expect(r.problems).toEqual(['"made_up_key" (set in "Old") is not a setting in Orca 9.9.9, so Orca ignores it.']);
    expect(r.values.name).toBeUndefined();
  });
});

describe('sameValue', () => {
  it('treats number spellings and one-item lists as equal', () => {
    expect(sameValue('0.20', '0.2')).toBe(true);
    expect(sameValue(['0.4'], '0.4')).toBe(true);
    expect(sameValue('50%', '50')).toBe(false);
    expect(sameValue(['0.4', '0.6'], ['0.4'])).toBe(false);
    expect(sameValue(['100', '100'], ['100'])).toBe(true);
    expect(sameValue('', '0')).toBe(false);
    expect(sameValue(undefined, undefined)).toBe(true);
  });
});

describe('differences', () => {
  it('lists the keys that differ', () => {
    const a = resolvePreset(baseline, 'process', { name: 'A', inherits: '0.20mm Standard @Acme', layer_height: '0.20' });
    const b = resolvePreset(baseline, 'process', { name: 'B', inherits: '0.20mm Standard @Acme', wall_loops: '3' });
    expect(differences(a, b)).toEqual(['wall_loops']);
  });
});

describe('forVariant', () => {
  it('keeps the value of the chosen extruder variant', () => {
    const r = resolvePreset(baseline, 'filament', {
      name: 'My TPU',
      inherits: 'Generic PETG @System',
      filament_extruder_variant: ['Direct Drive Standard', 'Bowden Standard'],
      pressure_advance: ['0.021', '0.4'],
      filament_type: ['FLEX'],
    });
    const v = forVariant(r, baseline, 'Bowden Standard');
    expect(v.values.pressure_advance.value).toEqual(['0.4']);
    expect(v.values.filament_extruder_variant.value).toEqual(['Bowden Standard']);
    expect(v.values.filament_type.value).toEqual(['FLEX']);
    expect(forVariant(r, baseline, 'Unknown')).toBe(r);
  });
});
