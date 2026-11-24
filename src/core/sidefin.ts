// SideFin's own data file, kept in the Orca data folder next to "user":
//   <data folder>/sidefin/sidefin.json
// It holds what Orca has no place for: the filament maker's advice, the
// calibration log and the hardware the printer has now. Orca leaves the file
// alone (its cleanup only touches the "system" and "log" folders).

export const DATA_PATH = 'sidefin/sidefin.json';

export interface Hardware {
  hotend: string;
  extruder: string;
}

/** The filament maker's advice for one filament, as published in its data sheet. */
export interface Advice {
  /** The product as the maker names it, e.g. "colorFabb PETG Economy". */
  product?: string;
  /** Where the values come from: a data sheet or product page. */
  source?: string;
  /** Advised values per Orca setting key, as text: "240-260", "12", "0-20%". */
  values: Record<string, string>;
  /** What has no Orca setting: drying, enclosure, hardened nozzle, ... */
  note?: string;
}

export type CalibrationTest = 'pa' | 'maxflow';

export const TESTS: { test: CalibrationTest; label: string; key: string }[] = [
  { test: 'pa', label: 'Pressure advance', key: 'pressure_advance' },
  { test: 'maxflow', label: 'Max volumetric speed', key: 'filament_max_volumetric_speed' },
];

/** One logged calibration of one filament on one nozzle. */
export interface Calibration {
  /** Filament family, e.g. "PETG REAL @VC31E". */
  filament: string;
  /** Nozzle size such as "0.4"; absent when the log does not say. */
  nozzle?: string;
  test: CalibrationTest;
  /** Date as yyyy-mm-dd. */
  date: string;
  /** The result, when logged. */
  value?: string;
  /** Hardware used, when logged. */
  hardware?: Partial<Hardware>;
  method?: string;
  note?: string;
}

export interface SideFinData {
  schema: 1;
  hardware?: Hardware;
  /** By filament family name. */
  advice: Record<string, Advice>;
  calibrations: Calibration[];
}

export const emptyData = (): SideFinData => ({ schema: 1, advice: {}, calibrations: [] });

/** Read the file; anything unreadable gives an empty file and the reason. */
export function parseData(text: string | undefined): { data: SideFinData; error?: string } {
  if (!text) return { data: emptyData() };
  try {
    const j = JSON.parse(text);
    if (!j || typeof j !== 'object') throw new Error('not an object');
    return {
      data: {
        schema: 1,
        ...(j.hardware ? { hardware: j.hardware } : {}),
        advice: j.advice && typeof j.advice === 'object' ? j.advice : {},
        calibrations: Array.isArray(j.calibrations) ? j.calibrations : [],
      },
    };
  } catch (e) {
    return { data: emptyData(), error: `sidefin.json could not be read (${(e as Error).message}).` };
  }
}

export const dataJson = (d: SideFinData) => JSON.stringify(d, null, 2) + '\n';

/** The hardware differs from the current hardware (only parts the log names are compared). */
export function otherHardware(used: Partial<Hardware> | undefined, now: Hardware | undefined): boolean {
  if (!used || !now) return false;
  const differs = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() !== b.trim().toLowerCase();
  return differs(used.hotend, now.hotend) || differs(used.extruder, now.extruder);
}

/** The newest log line for a filament, test and nozzle; lines without a nozzle count for every nozzle. */
export function latest(data: SideFinData, filament: string, test: CalibrationTest, nozzle?: string): Calibration | undefined {
  return data.calibrations
    .filter((c) => c.filament === filament && c.test === test && (c.nozzle === undefined || nozzle === undefined || Number(c.nozzle) === Number(nozzle)))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

export interface Due {
  filament: string;
  test: CalibrationTest;
  nozzle?: string;
  reason: 'none yet' | 'other hardware';
}

/** Filament, test and nozzle combinations with no result, or a result on other hardware. */
export function dueList(data: SideFinData, filaments: { name: string; nozzles: (string | undefined)[] }[]): Due[] {
  const out: Due[] = [];
  for (const f of filaments) {
    for (const { test } of TESTS) {
      for (const nozzle of f.nozzles) {
        const c = latest(data, f.name, test, nozzle);
        if (!c) out.push({ filament: f.name, test, nozzle, reason: 'none yet' });
        else if (otherHardware(c.hardware, data.hardware)) out.push({ filament: f.name, test, nozzle, reason: 'other hardware' });
      }
    }
  }
  return out;
}

/** A web search for the maker's data sheet of a filament. */
export function datasheetSearch(vendor: string | undefined, product: string): string {
  const q = [vendor, product, 'filament technical data sheet'].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
