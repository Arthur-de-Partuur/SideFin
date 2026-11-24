import { describe, expect, it } from 'vitest';
import { dataJson, datasheetSearch, dueList, latest, otherHardware, parseData, type SideFinData } from './sidefin';

const data: SideFinData = {
  schema: 1,
  hardware: { hotend: 'Rapido 2 UHF', extruder: 'Orbiter 2' },
  advice: { 'PETG A @Me': { product: 'Acme PETG', values: { nozzle_temperature: '230-250' } } },
  calibrations: [
    { filament: 'PETG A @Me', nozzle: '0.4', test: 'pa', date: '2024-06-21', hardware: { hotend: 'Rapido+ UHF', extruder: 'Orbiter 2' } },
    { filament: 'PETG A @Me', nozzle: '0.4', test: 'maxflow', date: '2024-02-12' },
    { filament: 'PETG A @Me', test: 'maxflow', date: '2023-01-01' },
  ],
};

describe('sidefin.json', () => {
  it('reads a file and survives a broken one', () => {
    expect(parseData(dataJson(data)).data).toEqual(data);
    expect(parseData(undefined).data.calibrations).toEqual([]);
    expect(parseData('{oops').error).toMatch(/could not be read/);
  });

  it('finds the newest log line; lines without a nozzle count for all nozzles', () => {
    expect(latest(data, 'PETG A @Me', 'maxflow', '0.4')?.date).toBe('2024-02-12');
    expect(latest(data, 'PETG A @Me', 'maxflow', '0.6')?.date).toBe('2023-01-01');
    expect(latest(data, 'PETG A @Me', 'pa', '0.6')).toBeUndefined();
  });

  it('compares only the hardware parts the log names', () => {
    expect(otherHardware({ hotend: 'Rapido+ UHF' }, data.hardware)).toBe(true);
    expect(otherHardware({ extruder: 'orbiter 2' }, data.hardware)).toBe(false);
    expect(otherHardware(undefined, data.hardware)).toBe(false);
  });

  it('lists what is due: nothing logged, or logged on other hardware', () => {
    const due = dueList(data, [{ name: 'PETG A @Me', nozzles: ['0.4', '0.6'] }]);
    expect(due).toEqual([
      { filament: 'PETG A @Me', test: 'pa', nozzle: '0.4', reason: 'other hardware' },
      { filament: 'PETG A @Me', test: 'pa', nozzle: '0.6', reason: 'none yet' },
    ]);
  });

  it('makes a data sheet search link', () => {
    expect(datasheetSearch('eSun', 'PETG')).toBe('https://www.google.com/search?q=eSun%20PETG%20filament%20technical%20data%20sheet');
  });
});
