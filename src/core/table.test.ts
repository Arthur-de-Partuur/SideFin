import { describe, expect, it } from 'vitest';
import { baseline } from './fixtures/baseline';
import type { PresetFile } from './presets';
import { buildRows, columnsFor, countDiffers, families, filterRows, printerFamilies, showValue } from './table';

const file = (kind: PresetFile['kind'], json: PresetFile['json']): PresetFile => ({ kind, path: `${kind}/${json.name}.json`, json });

const presets: PresetFile[] = [
  file('printer', { name: 'Me 0.40 nozzle', inherits: 'Acme 300 0.4 nozzle', printer_notes: 'MODEL_ME' }),
  file('printer', { name: 'Me 0.60 nozzle', inherits: 'Acme 300 0.4 nozzle', printer_notes: 'MODEL_ME', nozzle_diameter: ['0.6'] }),
  file('process', { name: 'Fine @Me 0.40', inherits: '0.20mm Standard @Acme', compatible_printers_condition: 'printer_notes=~/.*MODEL_ME.*/ and nozzle_diameter[0]==0.4', layer_height: '0.16' }),
  file('process', { name: 'Fine @Me 0.60', inherits: '0.20mm Standard @Acme', compatible_printers_condition: 'printer_notes=~/.*MODEL_ME.*/ and nozzle_diameter[0]==0.6', layer_height: '0.16', wall_loops: '3' }),
  file('process', { name: 'Other printer', inherits: '0.20mm Standard @Acme', compatible_printers_condition: 'printer_notes=~/.*OTHER.*/' }),
];

describe('viewer table', () => {
  const [me] = printerFamilies(baseline, presets);

  it('groups printers per nozzle', () => {
    expect(me.name).toBe('Me');
    expect(me.printers.map((p) => p.nozzle)).toEqual(['0.4', '0.6']);
  });

  it('lists only presets that fit the printer, one column per nozzle', () => {
    const fams = families(presets, 'process', me);
    expect(fams.map((f) => f.name)).toEqual(['Fine @Me']);
    const { columns, dflt, parents } = columnsFor(baseline, fams[0], presets, me);
    expect(columns.map((c) => c.label)).toEqual(['0.40 nozzle', '0.60 nozzle']);
    expect(dflt?.name).toBe('0.20mm Standard @Acme');
    expect(parents).toEqual(['0.20mm Standard @Acme']);

    const rows = buildRows(baseline, 'process', columns, dflt);
    const lh = rows.find((r) => r.key === 'layer_height')!;
    expect(lh.cells.map((c) => [c.value, c.differs])).toEqual([['0.16', true], ['0.16', true]]);
    expect(lh.nozzlesDiffer).toBe(false);
    const wl = rows.find((r) => r.key === 'wall_loops')!;
    expect(wl.cells.map((c) => c.value)).toEqual(['2', '3']);
    expect(wl.nozzlesDiffer).toBe(true);
    expect(countDiffers(rows)).toBe(2);
    expect(filterRows(rows, { level: 'all', onlyNozzlesDiffer: true }).map((r) => r.key)).toEqual(['compatible_printers_condition', 'wall_loops']);
    expect(filterRows(rows, { level: 'simple', search: 'layer' }).map((r) => r.key)).toEqual([]); // not placed in Orca's tabs in the fixture
    expect(filterRows(rows, { level: 'all', search: 'layer' }).map((r) => r.key)).toEqual(['layer_height']);
  });
});

describe('showValue', () => {
  it('shows values as Orca does', () => {
    expect(showValue({ key: 'a', type: 'coBool', mode: 'simple' }, '1').text).toBe('Yes');
    expect(showValue({ key: 'a', type: 'coFloats', mode: 'simple' }, ['0.4', '0.4']).text).toBe('0.4');
    expect(showValue({ key: 'a', type: 'coFloats', mode: 'simple' }, ['0.4', '0.6']).text).toBe('0.4 / 0.6');
    const e = { key: 'a', type: 'coEnum', mode: 'simple' as const, enumValues: ['disabled', 'enabled'], enumLabels: ['Off', 'On'] };
    expect(showValue(e, 'enabled').text).toBe('On');
    expect(showValue(e, '0')).toMatchObject({ text: '0', unknownChoice: true });
    expect(showValue(undefined, 'G90\nG21')).toMatchObject({ text: 'G90 …', full: 'G90\nG21' });
  });
});

describe('defaultLabel', () => {
  it('names the printer maker', async () => {
    const { defaultLabel } = await import('./table');
    const [me] = printerFamilies(baseline, presets);
    const fam = families(presets, 'process', me)[0];
    expect(defaultLabel(columnsFor(baseline, fam, presets, me).dflt)).toBe('Acme default');
    expect(defaultLabel(undefined)).toBe('Default');
  });
});
