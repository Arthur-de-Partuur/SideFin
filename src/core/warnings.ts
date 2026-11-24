// Warnings for values that look odd. They only inform: SideFin never changes a
// value by itself. Rules agreed with Arthur on 24 Nov 2026:
//   1. a number differs from the printer maker's default by more than 50%,
//   2. a line width is under 60% or over 200% of the nozzle size,
//   3. a nozzle temperature is outside the filament's own range.

import type { OrcaValue, SettingDef } from './types';

const NUMERIC = /^co(Float|Int|Percent|FloatOrPercent)s?$|^coFloatsOrPercents$|^coPercents$/;
const TEMPS = new Set(['nozzle_temperature', 'nozzle_temperature_initial_layer']);

const first = (v: OrcaValue | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (s: string | undefined) => (s === undefined || s.trim() === '' || s === 'nil' ? NaN : Number(s.replace(/%$/, '')));
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** "warn": likely a mistake (line width, temperature range). "hint": only far from the default, often on purpose. */
export interface Warning {
  level: 'warn' | 'hint';
  text: string;
}

export interface WarnContext {
  /** Nozzle size of the column, e.g. "0.4". */
  nozzle?: string;
  /** Other values in effect in the same preset, for rules that compare settings. */
  values: Record<string, OrcaValue | undefined>;
}

/** Why a value looks odd, in plain words, or undefined when it looks fine. */
export function warningFor(key: string, def: SettingDef | undefined, value: OrcaValue | undefined, dflt: OrcaValue | undefined, ctx: WarnContext): Warning | undefined {
  const v = first(value);
  const out: string[] = [];

  if (key.endsWith('line_width') && v !== undefined && ctx.nozzle) {
    const nozzle = Number(ctx.nozzle);
    const n = num(v);
    // 0 means Orca works the width out itself.
    if (n > 0 && nozzle > 0) {
      const pct = v.endsWith('%') ? n : (n / nozzle) * 100;
      if (pct < 60) out.push(`Line width is ${fmt(pct)}% of the ${ctx.nozzle} mm nozzle; under 60% often under-extrudes.`);
      else if (pct > 200) out.push(`Line width is ${fmt(pct)}% of the ${ctx.nozzle} mm nozzle; over 200% often gives poor walls.`);
    }
  }

  if (TEMPS.has(key)) {
    const t = num(v);
    const low = num(first(ctx.values.nozzle_temperature_range_low));
    const high = num(first(ctx.values.nozzle_temperature_range_high));
    if (!isNaN(t) && !isNaN(low) && t < low) out.push(`${t} °C is below this filament's range (${low}–${high} °C).`);
    if (!isNaN(t) && !isNaN(high) && t > high) out.push(`${t} °C is above this filament's range (${low}–${high} °C).`);
  }

  const hard = out.length > 0;
  const d = first(dflt);
  // Line widths are checked against the nozzle instead: the default is often for another nozzle.
  if (def && NUMERIC.test(def.type) && !key.endsWith('line_width') && v !== undefined && d !== undefined && v.endsWith('%') === d.endsWith('%')) {
    const a = num(v);
    const b = num(d);
    // 0 and negative values often mean "off" or "automatic", so they are not compared.
    if (a > 0 && b > 0 && !isNaN(a) && !isNaN(b) && Math.abs(a - b) / Math.abs(b) > 0.5) {
      out.push(`${fmt(Math.abs(a - b) / Math.abs(b) * 100)}% ${a > b ? 'higher' : 'lower'} than the default (${d}).`);
    }
  }
  return out.length ? { level: hard ? 'warn' : 'hint', text: out.join(' ') } : undefined;
}
