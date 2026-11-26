// What an Orca update changes for your presets (G5, P5).
// Your presets store only what you changed; everything else comes from the
// printer maker's profile or Orca's built-in default. A new Orca version can
// change those, so a value in effect can change without you touching it.

import { obsoleteKeys } from './edit';
import type { PresetFile } from './presets';
import { sameValue } from './resolve';
import { columnsFor, families, printerFamilies, type Column } from './table';
import type { Baseline, OrcaValue, PresetKind } from './types';

export interface UpdateChange {
  kind: PresetKind;
  /** Preset family, e.g. "PETG eSun @VC31E". */
  family: string;
  /** Column label, e.g. "0.40 nozzle". */
  label: string;
  nozzle?: string;
  key: string;
  before: OrcaValue | undefined;
  after: OrcaValue | undefined;
  /** Where the value comes from in the new version: a profile name or "default". */
  from: string;
  /** The new version's column, to pin the old value into its file. */
  column: Column;
}

/** Your preset holds the old default, and the default changed: maybe take the new one. */
export interface StaleValue {
  kind: PresetKind;
  family: string;
  label: string;
  nozzle?: string;
  key: string;
  /** Your value, which is the old default. */
  yours: OrcaValue | undefined;
  /** The new default (printer maker's profile or Orca's built-in). */
  after: OrcaValue | undefined;
  /** Name of the default the comparison uses, e.g. "Generic PETG @System". */
  dfltName: string;
  column: Column;
}

export interface NewSetting {
  kind: PresetKind;
  key: string;
}

export interface Obsolete {
  file: PresetFile;
  keys: string[];
}

export interface UpdateReport {
  from: string;
  to: string;
  changes: UpdateChange[];
  stale: StaleValue[];
  added: NewSetting[];
  obsolete: Obsolete[];
}

const KINDS: PresetKind[] = ['printer', 'filament', 'process'];

/**
 * For the presets of one printer, between two Orca versions:
 * - changes: inherited values that differ (they changed without you touching them);
 * - stale: values your preset sets to the old default, where the default changed
 *   (common in flat presets that copy every value);
 * - added: settings the new version brings; obsolete: settings it no longer knows.
 */
export function updateReport(before: Baseline, after: Baseline, presets: PresetFile[], printerName?: string): UpdateReport {
  const pick = (b: Baseline) => {
    const all = printerFamilies(b, presets);
    return all.find((p) => p.name === printerName) ?? all[0];
  };
  const pBefore = pick(before);
  const pAfter = pick(after);
  const changes: UpdateChange[] = [];
  const stale: StaleValue[] = [];
  for (const kind of KINDS) {
    const famsAfter = families(presets, kind, pAfter);
    const famsBefore = families(presets, kind, pBefore);
    for (const fam of famsAfter) {
      const old = famsBefore.find((f) => f.name === fam.name);
      if (!old) continue;
      const now = columnsFor(after, fam, presets, pAfter);
      const then = columnsFor(before, old, presets, pBefore);
      const colsAfter = now.columns;
      const colsBefore = then.columns;
      const dAfter = now.dflt?.resolved.values;
      const dBefore = then.dflt?.resolved.values;
      for (const col of colsAfter) {
        const prev = colsBefore.find((c) => c.file?.path === col.file?.path);
        if (!prev) continue;
        for (const [key, v] of Object.entries(col.resolved.values)) {
          if (!(key in before.settings)) continue;
          if (v.own) {
            const was = dBefore?.[key];
            const is = dAfter?.[key];
            if (was && is && sameValue(v.value, was.value) && !sameValue(was.value, is.value))
              stale.push({ kind, family: fam.name, label: col.label, nozzle: col.nozzle, key, yours: v.value, after: is.value, dfltName: now.dflt!.name, column: col });
            continue;
          }
          const b = prev.resolved.values[key];
          if (!b || sameValue(b.value, v.value)) continue;
          changes.push({ kind, family: fam.name, label: col.label, nozzle: col.nozzle, key, before: b.value, after: v.value, from: v.from, column: col });
        }
      }
    }
  }
  const added: NewSetting[] = [];
  for (const kind of KINDS) for (const key of after.presetKeys[kind]) if (!(key in before.settings) && key in after.settings) added.push({ kind, key });
  const obsolete = presets.map((file) => ({ file, keys: obsoleteKeys(after, file.json) })).filter((o) => o.keys.length > 0);
  return { from: before.orcaVersion, to: after.orcaVersion, changes, stale, added, obsolete };
}

/** Orca versions in the list older than the given one, newest first. */
export function olderVersions(versions: string[], current: string): string[] {
  const n = (v: string) => v.split('.').map(Number);
  const cmp = (a: string, b: string) => {
    const x = n(a);
    const y = n(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  };
  return versions.filter((v) => cmp(v, current) < 0).sort((a, b) => cmp(b, a));
}
