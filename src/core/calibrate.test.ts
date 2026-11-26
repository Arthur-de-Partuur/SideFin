import { describe, expect, it } from 'vitest';
import { bedSize, emSeries, flowRows, flowTesterFit, flowTesterGcode, methodById, orcaFlowRatio, paRange, setup, tempColumns } from './calibrate';
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
const printer = {
  printable_area: ['0x0', '300x0', '300x300', '0x300'],
  gcode_flavor: 'klipper',
  retraction_length: ['0.5'],
  retraction_speed: ['40'],
  machine_start_gcode:
    'START_PRINT EXTRUDER_TEMP=[nozzle_temperature_initial_layer] EXTRUDER_OTHER_LAYER_TEMP=[nozzle_temperature] BED_TEMP=[bed_temperature_initial_layer_single] TOTAL_LAYER_COUNT={total_layer_count} X0={first_layer_print_min[0]} Y0={first_layer_print_min[1]} X1={first_layer_print_max[0]} Y1={first_layer_print_max[1]}',
  machine_end_gcode: 'END_PRINT',
};

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
    expect(lines['Bed Width']).toBe('300 mm');
    expect(lines['Bed Length']).toBe('300 mm');
    expect(lines['Retraction Distance']).toBe('0.5 mm');
    expect(lines['Start Flow']).toBe('12 mm³/s');
    expect(lines['Start Temperature']).toBe('230 °C');
    expect(lines['Bed Temperature']).toBe('80 °C');
    expect(lines['End Gcode']).toBe('END_PRINT');
    expect(lines['Start Gcode']).toBe(
      'START_PRINT EXTRUDER_TEMP=${tempStart} EXTRUDER_OTHER_LAYER_TEMP=${tempStart} BED_TEMP=${bedTemp} TOTAL_LAYER_COUNT=1 X0=${bedMargin} Y0=${bedMargin} X1=${bedWidth - bedMargin} Y1=${bedLength - bedMargin}',
    );
  });

  it('fits the flow rows and temperature columns on the bed', () => {
    expect(flowTesterFit({ width: 300, length: 300 })).toEqual({ rows: 6, columns: 4 });
    expect(flowTesterFit({ width: 200, length: 200 })).toEqual({ rows: 4, columns: 2 });
    // 12 to 28 in steps of 2 is 9 rows; 6 fit, so the step grows to 4.
    expect(flowRows(20, 6)).toEqual({ start: 12, offset: 4, steps: 5 });
    expect(tempColumns(230, 260, 245, 2)).toEqual({ start: 230, offset: 30, steps: 2 });
    const lines = Object.fromEntries(setup(methodById('flow-tester')!, { nozzle: '0.4', filament, printer }).map((l) => [l.label, l.value]));
    expect(lines['Offset Flow']).toBe('4 mm³/s');
    expect(lines['Flow Steps']).toBe('5');
  });

  it('turns Orca placeholders into flow tester G-code', () => {
    const values = { filament_type: ['PETG'], nozzle_diameter: ['0.4', '0.6'] };
    expect(flowTesterGcode('M190 S{bed_temperature[initial_extruder]}\nM109 S{nozzle_temperature[0]}', values).gcode).toBe('M190 S${bedTemp}\nM109 S${tempStart}');
    expect(flowTesterGcode('; {filament_type[initial_tool]} [nozzle_diameter]', values).gcode).toBe('; PETG 0.4');
    const odd = flowTesterGcode('{if layer_num == 0}G1{endif} L={layer_num + 1} {unknown_key}', values);
    expect(odd.unresolved).toEqual(['{if layer_num == 0}', '{endif}', '{layer_num + 1}', '{unknown_key}']);
    expect(odd.gcode).toBe('{if layer_num == 0}G1{endif} L={layer_num + 1} {unknown_key}');
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
