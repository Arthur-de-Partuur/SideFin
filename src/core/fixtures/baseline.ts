// A tiny made-up baseline for tests. It mirrors the shape of a real one,
// but none of it is copied from anyone's profiles.
import type { Baseline } from '../types';

export const baseline: Baseline = {
  schema: 1,
  orcaVersion: '9.9.9',
  source: { repository: 'https://example.invalid/orca', tag: 'v9.9.9' },
  generatedAt: '2026-01-01T00:00:00.000Z',
  settings: {
    layer_height: { key: 'layer_height', type: 'coFloat', mode: 'simple', default: '0.2' },
    wall_loops: { key: 'wall_loops', type: 'coInt', mode: 'simple', default: '2' },
    bridge_density: { key: 'bridge_density', type: 'coPercent', mode: 'advanced', default: '100%' },
    nozzle_diameter: { key: 'nozzle_diameter', type: 'coFloats', mode: 'simple', default: ['0.4'] },
    retraction_length: { key: 'retraction_length', type: 'coFloats', mode: 'simple', default: ['0.8'] },
    pressure_advance: { key: 'pressure_advance', type: 'coFloats', mode: 'advanced', default: ['0.02'] },
    filament_type: { key: 'filament_type', type: 'coStrings', mode: 'simple', default: ['PLA'] },
  },
  presetKeys: {
    process: ['layer_height', 'wall_loops', 'bridge_density'],
    filament: ['pressure_advance', 'filament_type'],
    printer: ['nozzle_diameter', 'retraction_length'],
  },
  profiles: {
    process: {
      'Acme/fdm_process_common': { name: 'fdm_process_common', vendor: 'Acme', layer_height: '0.2', wall_loops: '3' },
      'Acme/0.20mm Standard @Acme': { name: '0.20mm Standard @Acme', vendor: 'Acme', inherits: 'fdm_process_common', wall_loops: '2' },
    },
    filament: {
      'OrcaFilamentLibrary/fdm_filament_pet': { name: 'fdm_filament_pet', vendor: 'OrcaFilamentLibrary', filament_type: ['PETG'] },
      'OrcaFilamentLibrary/Generic PETG @System': { name: 'Generic PETG @System', vendor: 'OrcaFilamentLibrary', inherits: 'fdm_filament_pet' },
      'Acme/fdm_filament_pet': { name: 'fdm_filament_pet', vendor: 'Acme', filament_type: ['PET'] },
    },
    printer: {
      'Acme/Acme 300 0.4 nozzle': { name: 'Acme 300 0.4 nozzle', vendor: 'Acme', nozzle_diameter: ['0.4'] },
    },
  },
  report: { settings: 7, withDefault: 7, shownInOrca: 0, unparsedDefaults: [] },
};
