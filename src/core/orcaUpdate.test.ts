import { describe, expect, it } from 'vitest';
import { baseline } from './fixtures/baseline';
import { olderVersions, updateReport } from './orcaUpdate';
import type { PresetFile } from './presets';
import type { Baseline } from './types';

const file = (kind: PresetFile['kind'], json: PresetFile['json']): PresetFile => ({ kind, path: `${kind}/${json.name}.json`, json });
const presets: PresetFile[] = [
  file('printer', { name: 'Me 0.40 nozzle', inherits: 'Acme 300 0.4 nozzle', printer_notes: 'MODEL_ME' }),
  file('process', { name: 'Fine @Me 0.40', inherits: '0.20mm Standard @Acme', compatible_printers_condition: 'printer_notes=~/.*MODEL_ME.*/', layer_height: '0.16', old_thing: '1' }),
];

// The "new" Orca: the maker's profile sets 3 walls instead of 2, the built-in
// bridge density goes to 90%, there is a new setting, and old_thing is gone.
const newer: Baseline = {
  ...baseline,
  orcaVersion: '10.0.0',
  settings: { ...baseline.settings, bridge_density: { ...baseline.settings.bridge_density, default: '90%' }, top_new: { key: 'top_new', type: 'coBool', mode: 'simple', default: '1' } },
  presetKeys: { ...baseline.presetKeys, process: [...baseline.presetKeys.process, 'top_new'] },
  profiles: {
    ...baseline.profiles,
    process: { ...baseline.profiles.process, 'Acme/0.20mm Standard @Acme': { ...baseline.profiles.process['Acme/0.20mm Standard @Acme'], wall_loops: '3' } },
  },
};

describe('what an Orca update changes', () => {
  const r = updateReport(baseline, newer, presets);

  it('lists inherited values that changed, and leaves your own values out', () => {
    const got = r.changes.map((c) => [c.key, c.before, c.after, c.label]).sort();
    expect(got).toEqual([
      ['bridge_density', '100%', '90%', '0.40 nozzle'],
      ['wall_loops', '2', '3', '0.40 nozzle'],
    ]);
    expect(r.changes.some((c) => c.key === 'layer_height')).toBe(false);
  });

  it('finds own values that are the old default, where the default changed', () => {
    const flat = [presets[0], file('process', { ...presets[1].json, wall_loops: '2' })];
    const s = updateReport(baseline, newer, flat).stale;
    expect(s.map((x) => [x.key, x.yours, x.after])).toEqual([['wall_loops', '2', '3']]);
  });

  it('lists new settings and settings the new Orca does not know', () => {
    expect(r.added).toEqual([{ kind: 'process', key: 'top_new' }]);
    expect(r.obsolete.find((o) => o.file.kind === 'process')?.keys).toEqual(['old_thing']);
  });

  it('orders older versions newest first', () => {
    expect(olderVersions(['2.5.2', '2.4.2', '2.10.0', '2.3.0'], '2.5.2')).toEqual(['2.4.2', '2.3.0']);
  });
});
