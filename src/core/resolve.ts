// Works out the value Orca uses for every setting of a preset, and where it
// comes from: the preset itself, a profile it inherits from, or Orca's built-in
// default. Orca does the same when it loads a preset:
//   1. start from the built-in defaults (PrintConfig.cpp),
//   2. apply the profiles in the "inherits" chain, root first,
//   3. apply the preset's own values.

import type { Baseline, OrcaValue, PresetKind, ProfileJson } from './types';

/** Where a profile in the chain was found. */
export type ProfileOrigin = 'user' | 'system';

export interface ChainLink {
  name: string;
  origin: ProfileOrigin;
  /** Vendor folder for system profiles, e.g. "Ratrig" or "OrcaFilamentLibrary". */
  vendor?: string;
  profile: ProfileJson;
}

export interface ResolvedValue {
  value: OrcaValue | undefined;
  /** Name of the profile that sets it, or "default" for Orca's built-in default. */
  from: string;
  origin: ProfileOrigin | 'default';
  /** True when the preset itself sets it (first link of the chain). */
  own: boolean;
}

export interface ResolvedPreset {
  kind: PresetKind;
  name: string;
  /** The preset first, then each profile it inherits from. */
  chain: ChainLink[];
  values: Record<string, ResolvedValue>;
  /** Things that stopped the chain or look wrong, in plain words. */
  problems: string[];
}

export const LIBRARY_VENDOR = 'OrcaFilamentLibrary';

/**
 * Find a system profile by name. Orca looks in the vendor of the profile that
 * inherits first, then in the Orca filament library, then anywhere.
 */
export function findSystemProfile(
  baseline: Baseline,
  kind: PresetKind,
  name: string,
  vendor?: string,
): (ProfileJson & { vendor: string }) | undefined {
  const all = baseline.profiles[kind];
  if (vendor && all[`${vendor}/${name}`]) return all[`${vendor}/${name}`];
  if (all[`${LIBRARY_VENDOR}/${name}`]) return all[`${LIBRARY_VENDOR}/${name}`];
  return Object.values(all).find((p) => p.name === name);
}

/** Profile keys that describe the file rather than a setting. */
const META = new Set(['name', 'inherits', 'type', 'from', 'instantiation', 'setting_id', 'filament_id', 'base_id', 'version', 'is_custom_defined', 'renamed_from', 'vendor']);

export function resolvePreset(
  baseline: Baseline,
  kind: PresetKind,
  preset: ProfileJson,
  userProfiles: Record<string, ProfileJson> = {},
  presetOrigin: ProfileOrigin = 'user',
): ResolvedPreset {
  const problems: string[] = [];
  const chain: ChainLink[] = [];
  const first = preset as ProfileJson & { vendor?: string };
  chain.push({ name: preset.name, origin: presetOrigin, vendor: first.vendor, profile: preset });

  let vendor = first.vendor;
  let parent = preset.inherits;
  const seen = new Set([preset.name]);
  while (parent) {
    if (seen.has(parent)) {
      problems.push(`"${parent}" inherits from itself in a loop.`);
      break;
    }
    seen.add(parent);
    // A user preset can only inherit from a system preset in Orca, but SideFin
    // also follows user parents so that copies of system files work.
    const user = chain.length > 0 && chain[chain.length - 1].origin === 'user' ? userProfiles[parent] : undefined;
    const sys = user ? undefined : findSystemProfile(baseline, kind, parent, vendor);
    if (user) {
      chain.push({ name: parent, origin: 'user', profile: user });
      parent = user.inherits;
    } else if (sys) {
      chain.push({ name: parent, origin: 'system', vendor: sys.vendor, profile: sys });
      vendor = sys.vendor;
      parent = sys.inherits;
    } else {
      problems.push(`"${chain[chain.length - 1].name}" inherits from "${parent}", which was not found in Orca ${baseline.orcaVersion}.`);
      break;
    }
  }

  const keys = new Set(baseline.presetKeys[kind]);
  for (const link of chain) for (const k of Object.keys(link.profile)) if (!META.has(k)) keys.add(k);

  const values: Record<string, ResolvedValue> = {};
  for (const key of keys) {
    const i = chain.findIndex((l) => key in l.profile);
    if (i >= 0) {
      const link = chain[i];
      values[key] = { value: link.profile[key] as OrcaValue, from: link.name, origin: link.origin, own: i === 0 };
    } else {
      values[key] = { value: baseline.settings[key]?.default, from: 'default', origin: 'default', own: false };
    }
    if (!baseline.settings[key]) {
      problems.push(`"${key}" (set in "${values[key].from}") is not a setting in Orca ${baseline.orcaVersion}, so Orca ignores it.`);
    }
  }
  return { kind, name: preset.name, chain, values, problems };
}

/** Split a value into items: Orca lists per-extruder values, one item per extruder. */
function items(v: OrcaValue | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function sameItem(a: string, b: string): boolean {
  if (a === b) return true;
  const na = Number(a.replace(/%$/, ''));
  const nb = Number(b.replace(/%$/, ''));
  return a.endsWith('%') === b.endsWith('%') && a.trim() !== '' && b.trim() !== '' && !isNaN(na) && !isNaN(nb) && na === nb;
}

/**
 * True when Orca would treat both values the same: "0.20" equals "0.2", and a
 * single value equals a list of one.
 */
export function sameValue(a: OrcaValue | undefined, b: OrcaValue | undefined): boolean {
  const x = items(a);
  const y = items(b);
  return x.length === y.length && x.every((v, i) => sameItem(v, y[i]));
}

/** Keys whose value differs between two resolved presets, in the order of the first. */
export function differences(a: ResolvedPreset, b: ResolvedPreset): string[] {
  const keys = new Set([...Object.keys(a.values), ...Object.keys(b.values)]);
  return [...keys].filter((k) => !sameValue(a.values[k]?.value, b.values[k]?.value));
}
