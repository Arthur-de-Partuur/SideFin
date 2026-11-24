// Calibration methods and the values to type into each test tool.
// SideFin does not run the tests: Orca or an outside tool makes the G-code.
// SideFin works out the setup from the presets, then keeps the result.

import type { CalibrationTest } from './sidefin';
import type { OrcaValue } from './types';

export interface Method {
  id: string;
  test: CalibrationTest;
  label: string;
  /** Where the test is made: a web tool or a guide. Orca's own tests have no link. */
  url?: string;
  /** Short steps shown above the setup values. */
  steps: string[];
}

export const METHODS: Method[] = [
  {
    id: 'orca-pa',
    test: 'pa',
    label: 'Orca: Pressure advance test',
    url: 'https://github.com/OrcaSlicer/OrcaSlicer/wiki/pressure_advance_calib',
    steps: [
      'In Orca, pick this printer (nozzle) and filament preset.',
      'Calibration menu > Pressure advance. Choose Pattern (or Line/Tower), enter the values below and print.',
      'Pick the sharpest corner or most even line and enter its value as the result.',
    ],
  },
  {
    id: 'ellis-pa',
    test: 'pa',
    label: "Ellis' PA tool",
    url: 'https://ellis3dp.com/Pressure_Linear_Advance_Tool/',
    steps: ['Open the tool, enter the values below, download the G-code and print it.', 'Enter the value of the best line as the result.'],
  },
  {
    id: 'orca-em',
    test: 'em',
    label: 'Orca: Flow ratio test',
    url: 'https://github.com/OrcaSlicer/OrcaSlicer/wiki/flow_ratio_calib',
    steps: [
      'Do pressure advance first.',
      'In Orca, pick this printer (nozzle) and filament preset. Calibration menu > Flow rate, print, and pick the smoothest top.',
      'Enter the flow ratio of that block as the result, or its modifier (as in the Pass 1 and Pass 2 tests) and SideFin works out the ratio.',
    ],
  },
  {
    id: 'ellis-em',
    test: 'em',
    label: "Ellis' extrusion multiplier cubes",
    url: 'https://ellis3dp.com/Print-Tuning-Guide/articles/extrusion_multiplier.html',
    steps: [
      'Do pressure advance first.',
      'Print 30×30×3 mm cubes, one per flow ratio below: infill 30%+, 2 bottom layers, as many top layers as fit (10–11 at 0.2 mm), monotonic top, no ironing, top speed about 60 mm/s.',
      'Pick the smoothest top (if in doubt, the higher one). Repeat in 0.5% steps if you like, and enter the flow ratio as the result.',
    ],
  },
  {
    id: 'orca-maxflow',
    test: 'maxflow',
    label: 'Orca: Max flowrate test',
    url: 'https://github.com/OrcaSlicer/OrcaSlicer/wiki/volumetric_speed_calib',
    steps: [
      'In Orca, pick this printer (nozzle) and filament preset. Calibration menu > Max flowrate, enter the values below and print.',
      'Find the height where the walls start to fail and work out the flow there (Orca shows how). Orca advises entering a value 10-20% below that as the result.',
    ],
  },
  {
    id: 'flow-tester',
    test: 'maxflow',
    label: 'Hotend flow tester',
    url: 'https://hotend-flow-tester.netlify.app/',
    steps: [
      'Open the tool, enter the values below, download the G-code and print it.',
      'Weigh or look at the blobs: pick the highest flow that still extrudes fully, and the temperature it was printed at.',
    ],
  },
];

export const methodsFor = (test: CalibrationTest) => METHODS.filter((m) => m.test === test);
export const methodById = (id: string | undefined) => METHODS.find((m) => m.id === id);

/** The first number of a value: lists hold one value per extruder. */
export function num(v: OrcaValue | undefined): number | undefined {
  const x = Array.isArray(v) ? v[0] : v;
  if (x === undefined || x === null || x === '' || x === 'nil') return undefined;
  const n = Number(String(x).replace(/%$/, ''));
  return Number.isFinite(n) ? n : undefined;
}

/** Bed width and length from printable_area ("0x0", "300x0", "300x300", "0x300"). */
export function bedSize(area: OrcaValue | undefined): { width: number; length: number } | undefined {
  if (!Array.isArray(area) || !area.length) return undefined;
  const pts = area.map((p) => String(p).split('x').map(Number));
  if (pts.some((p) => p.length !== 2 || p.some((n) => !Number.isFinite(n)))) return undefined;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { width: Math.max(...xs) - Math.min(...xs), length: Math.max(...ys) - Math.min(...ys) };
}

const round = (n: number, step: number) => Math.round(n / step) * step;
/** A number without floating point noise: 0.1 + 0.2 shows as 0.3. */
export const fmt = (n: number) => String(Number(n.toFixed(4)));

export interface SetupLine {
  label: string;
  value: string;
}

export interface SetupContext {
  nozzle?: string;
  /** The filament preset's values in effect for this nozzle. */
  filament: Record<string, OrcaValue | undefined>;
  /** The printer preset's values in effect for this nozzle. */
  printer: Record<string, OrcaValue | undefined>;
}

/** PA range around the value now; 0 to 0.1 when there is none. */
export function paRange(current: number | undefined, step: number): { start: number; end: number; step: number } {
  if (current === undefined || current <= 0) return { start: 0, end: 0.1, step };
  const start = Math.max(0, round(current - 0.03, 0.005));
  return { start, end: round(current + 0.03, 0.005), step };
}

/** Flow rows for the hotend flow tester, around the value now, in steps of 2 mm³/s. */
export function flowRows(current: number | undefined): { start: number; offset: number; steps: number } {
  const c = current && current > 0 ? current : 15;
  const start = Math.max(2, round(c * 0.6, 2));
  const end = round(c * 1.4, 2);
  return { start, offset: 2, steps: Math.max(2, Math.round((end - start) / 2) + 1) };
}

/** Temperature columns over the filament's range, at most 4. */
export function tempColumns(low: number | undefined, high: number | undefined, now: number | undefined): { start: number; offset: number; steps: number } {
  if (low === undefined || high === undefined || high <= low) return { start: now ?? 220, offset: 10, steps: 1 };
  const steps = Math.min(4, Math.floor((high - low) / 10) + 1);
  if (steps === 1) return { start: now ?? low, offset: 10, steps: 1 };
  const offset = steps > 1 ? round((high - low) / (steps - 1), 5) : 10;
  return { start: low, offset, steps };
}

/** Flow ratios for the cubes: the value now and ±2% and ±4%. */
export function emSeries(current: number | undefined): number[] {
  const c = current && current > 0 ? current : 1;
  return [-0.04, -0.02, 0, 0.02, 0.04].map((d) => Number((c * (1 + d)).toFixed(3)));
}

/** New flow ratio from Orca's flow rate test: the value now times (100 + modifier) / 100. */
export const orcaFlowRatio = (current: number, modifier: number) => Number(((current * (100 + modifier)) / 100).toFixed(4));

/** What to set up for a test with one method, from the presets. */
export function setup(method: Method, ctx: SetupContext): SetupLine[] {
  const f = ctx.filament;
  const p = ctx.printer;
  const lines: SetupLine[] = [];
  const add = (label: string, v: string | number | undefined, unit = '') => {
    if (v !== undefined && v !== '') lines.push({ label, value: `${typeof v === 'number' ? fmt(v) : v}${unit}` });
  };
  const nozzleTemp = num(f.nozzle_temperature);
  const low = num(f.nozzle_temperature_range_low);
  const high = num(f.nozzle_temperature_range_high);
  const hot = num(f.hot_plate_temp);
  const textured = num(f.textured_plate_temp);
  const bedTemp = hot ?? textured;
  const bedLabel = hot !== undefined && textured !== undefined && hot !== textured ? `${hot} °C (textured plate: ${textured} °C)` : bedTemp !== undefined ? `${bedTemp} °C` : undefined;
  const fan = num(f.fan_max_speed);
  const retLen = num(f.filament_retraction_length) ?? num(p.retraction_length);
  const retSpeed = num(f.filament_retraction_speed) ?? num(p.retraction_speed);
  const bed = bedSize(p.printable_area);
  const nozzle = ctx.nozzle ?? (num(p.nozzle_diameter) !== undefined ? fmt(num(p.nozzle_diameter)!) : undefined);

  switch (method.id) {
    case 'orca-pa': {
      const r = paRange(num(f.pressure_advance), 0.002);
      add('Start PA', r.start);
      add('End PA', r.end);
      add('PA step', r.step);
      break;
    }
    case 'ellis-pa': {
      const r = paRange(num(f.pressure_advance), 0.005);
      add('Firmware', p.gcode_flavor === 'klipper' ? 'Klipper' : String(p.gcode_flavor ?? ''));
      add('Bed size', bed ? `${bed.width} × ${bed.length} mm` : undefined);
      add('Nozzle diameter', nozzle, ' mm');
      add('Filament diameter', num(f.filament_diameter), ' mm');
      add('Nozzle temperature', nozzleTemp, ' °C');
      add('Bed temperature', bedLabel);
      add('Fan', fan, '%');
      add('Retraction', retLen !== undefined ? `${fmt(retLen)} mm${retSpeed !== undefined ? ` at ${fmt(retSpeed)} mm/s` : ''}` : undefined);
      add('PA start', r.start);
      add('PA end', r.end);
      add('PA increment', r.step);
      break;
    }
    case 'orca-em':
      add('Flow ratio now', num(f.filament_flow_ratio) ?? 1);
      break;
    case 'ellis-em':
      add('Flow ratios to print', emSeries(num(f.filament_flow_ratio)).map(fmt).join(', '));
      add('Top line width', nozzle, ' mm');
      add('Fan', fan, '%');
      break;
    case 'orca-maxflow': {
      const c = num(f.filament_max_volumetric_speed);
      const start = c ? Math.max(1, round(c * 0.6, 1)) : 5;
      add('Start volumetric speed', start, ' mm³/s');
      add('End volumetric speed', c ? round(c * 1.4, 1) : 20, ' mm³/s');
      add('Step', 0.5, ' mm³/s');
      break;
    }
    case 'flow-tester': {
      const rows = flowRows(num(f.filament_max_volumetric_speed));
      const cols = tempColumns(low, high, nozzleTemp);
      add('Bed width / length', bed ? `${bed.width} / ${bed.length} mm` : undefined);
      add('Filament diameter', num(f.filament_diameter) !== undefined && num(f.filament_diameter)! > 2.2 ? '2.85mm' : '1.75mm');
      add('Bed temperature', bedTemp, ' °C');
      add('Fan speed', 0, '%');
      add('Retraction distance', retLen, ' mm');
      add('Retraction speed', retSpeed, ' mm/s');
      add('Start flow', rows.start, ' mm³/s');
      add('Offset flow', rows.offset, ' mm³/s');
      add('Flow steps', rows.steps);
      add('Start temperature', cols.start, ' °C');
      add('Offset temperature', cols.offset, ' °C');
      add('Temperature steps', cols.steps);
      break;
    }
  }
  return lines;
}
