import { describe, expect, it } from 'vitest';
import { bedSize, emSeries, flowRows, methodById, orcaFlowRatio, paRange, setup, tempColumns } from './calibrate';
import { lastMethod, type SideFinData } from './sidefin';

const filament = {
  nozzle_temperature: ['245'],
  nozzle_temperature_range_low: ['230'],
  nozzle_temperature_range_high: ['260'],
  hot_plate_temp: ['80'],
  textured_plate_temp: ['80'],
  fan_max_speed: ['30'],
  filament_diameter: ['1.75'],
  filament_retraction_length: ['nil'],
  pressure_advance: ['0.04'],
  filament_flow_ratio: ['0.98'],
  filament_max_volumetric_speed: ['20'],
};
const printer = { printable_area: ['0x0', '300x0', '300x300', '0x300'], gcode_flavor: 'klipper', retraction_length: ['0.5'], retraction_speed: ['40'] };

describe('calibration setup', () => {
  it('reads the bed size', () => {
    expect(bedSize(printer.printable_area)).toEqual({ width: 300, length: 300 });
    expect(bedSize(undefined)).toBeUndefined();
  });

  it('puts the PA range around the value now', () => {
    expect(paRange(0.04, 0.002)).toEqual({ start: 0.01, end: 0.07, step: 0.002 });
    expect(paRange(undefined, 0.005)).toEqual({ start: 0, end: 0.1, step: 0.005 });
    expect(paRange(0.01, 0.005).start).toBe(0);
  });

  it('spreads flow rows and temperature columns', () => {
    expect(flowRows(20)).toEqual({ start: 12, offset: 2, steps: 9 });
    expect(tempColumns(230, 260, 245)).toEqual({ start: 230, offset: 10, steps: 4 });
    expect(tempColumns(undefined, undefined, 245)).toEqual({ start: 245, offset: 10, steps: 1 });
    expect(tempColumns(248, 252, 250)).toEqual({ start: 250, offset: 10, steps: 1 });
  });

  it('works out flow ratios', () => {
    expect(emSeries(1)).toEqual([0.96, 0.98, 1, 1.02, 1.04]);
    expect(orcaFlowRatio(0.98, -5)).toBe(0.931);
  });

  it('lists what to type into the flow tester, with the printer retraction when the filament has none', () => {
    const lines = Object.fromEntries(setup(methodById('flow-tester')!, { nozzle: '0.4', filament, printer }).map((l) => [l.label, l.value]));
    expect(lines['Bed width / length']).toBe('300 / 300 mm');
    expect(lines['Retraction distance']).toBe('0.5 mm');
    expect(lines['Start flow']).toBe('12 mm³/s');
    expect(lines['Start temperature']).toBe('230 °C');
  });

  it('names the firmware for the PA tool', () => {
    const lines = setup(methodById('ellis-pa')!, { nozzle: '0.4', filament, printer });
    expect(lines.find((l) => l.label === 'Firmware')?.value).toBe('Klipper');
    expect(lines.find((l) => l.label === 'PA increment')?.value).toBe('0.005');
  });

  it('starts with the method used last', () => {
    const data: SideFinData = {
      schema: 1,
      advice: {},
      calibrations: [
        { filament: 'A', test: 'pa', date: '2026-01-01', method: 'orca-pa' },
        { filament: 'B', test: 'pa', date: '2026-02-01', method: 'ellis-pa' },
        { filament: 'B', test: 'pa', date: '2026-03-01', method: 'accepted as is' },
      ],
    };
    expect(lastMethod(data, 'pa', ['orca-pa', 'ellis-pa'])).toBe('ellis-pa');
    expect(lastMethod(data, 'maxflow', ['flow-tester'])).toBeUndefined();
  });
});
