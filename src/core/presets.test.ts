import { describe, expect, it } from 'vitest';
import { collectPresets, familyOf, isCompatible, nozzleOf } from './presets';

describe('collectPresets', () => {
  it('finds user presets by folder and skips system copies and broken files', () => {
    const files = [
      { path: 'Datadir/user/default/machine/My printer 0.40 nozzle.json', text: '{"name":"My printer 0.40 nozzle"}' },
      { path: 'Datadir\\user\\default\\filament\\PLA 0.40 @Me.json', text: '{"name":"PLA 0.40 @Me"}' },
      { path: 'Datadir/user/default/filament/PLA 0.40 @Me.info', text: 'sync_info =' },
      { path: 'Datadir/system/RatRig/process/x.json', text: '{"name":"x"}' },
      { path: 'Datadir/user/default/process/bad.json', text: '{oops' },
    ];
    const { presets, skipped } = collectPresets(files);
    expect(presets.map((p) => [p.kind, p.json.name])).toEqual([
      ['printer', 'My printer 0.40 nozzle'],
      ['filament', 'PLA 0.40 @Me'],
    ]);
    expect(skipped).toHaveLength(1);
  });
});

describe('nozzleOf and familyOf', () => {
  it('reads the nozzle from the printer, the condition or the name', () => {
    expect(nozzleOf('printer', { name: 'X 0.40 nozzle' }, ['0.4'])).toBe('0.4');
    expect(nozzleOf('filament', { name: 'TPU @Me', compatible_printers_condition: 'printer_notes=~/.*ME.*/ and nozzle_diameter[0]==0.6' })).toBe('0.6');
    expect(nozzleOf('process', { name: '0.20mm Quality @Me 0.40' })).toBe('0.4');
    expect(nozzleOf('process', { name: '0.20mm Quality @Me' })).toBeUndefined();
  });
  it('drops the nozzle size but keeps layer heights', () => {
    expect(familyOf('VC31-300E 0.40 nozzle')).toBe('VC31-300E');
    expect(familyOf('TPU 85A&98A AzureFilm 0.60 @VC31E')).toBe('TPU 85A&98A AzureFilm @VC31E');
    expect(familyOf('0.20mm Quality @VC31E 0.40')).toBe('0.20mm Quality @VC31E');
    expect(familyOf('LW-PLA ColorFabb @VC31E')).toBe('LW-PLA ColorFabb @VC31E');
  });
});

describe('isCompatible', () => {
  const printer = { name: 'Me 0.40 nozzle', notes: 'PRINTER_MODEL_ME', nozzle: '0.4' };
  it('follows printer_notes and nozzle_diameter conditions', () => {
    const cond = (c: string) => ({ name: 'p', compatible_printers_condition: c });
    expect(isCompatible(cond('printer_notes=~/.*PRINTER_MODEL_ME.*/ and nozzle_diameter[0]==0.4'), printer)).toBe(true);
    expect(isCompatible(cond('printer_notes=~/.*PRINTER_MODEL_ME.*/ and nozzle_diameter[0]==0.6'), printer)).toBe(false);
    expect(isCompatible(cond('printer_notes=~/.*OTHER.*/'), printer)).toBe(false);
    expect(isCompatible(cond('printer_notes!~/.*OTHER.*/'), printer)).toBe(true);
    expect(isCompatible(cond(''), printer)).toBe(true);
  });
  it('uses the compatible_printers list when it has names', () => {
    expect(isCompatible({ name: 'p', compatible_printers: ['Me 0.40 nozzle'] }, printer)).toBe(true);
    expect(isCompatible({ name: 'p', compatible_printers: ['Other'] }, printer)).toBe(false);
  });
});
