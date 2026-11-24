// Shared types for SideFin's core and the defaults builder.

/** Orca's detail levels. Orca shows Simple and Advanced; Expert and Develop are hidden test levels. */
export type SettingMode = 'simple' | 'advanced' | 'expert' | 'develop';

/** The three kinds of presets, named as in SideFin's tabs. */
export type PresetKind = 'printer' | 'filament' | 'process';

/** A value as Orca writes it in profile JSON: one string, or a list for per-extruder settings. */
export type OrcaValue = string | string[];

/** One setting as defined in Orca's source (PrintConfig.cpp + Tab.cpp). */
export interface SettingDef {
  key: string;
  /** Orca's option type, e.g. coFloat, coFloats, coPercent, coEnum, coString. */
  type: string;
  label?: string;
  fullLabel?: string;
  category?: string;
  tooltip?: string;
  /** Unit shown after the field, e.g. "mm/s" or "%". */
  unit?: string;
  mode: SettingMode;
  min?: number;
  max?: number;
  enumValues?: string[];
  enumLabels?: string[];
  /** Orca's built-in default, in profile-JSON form. */
  default?: OrcaValue;
  /** Source text of a default the builder could not read. */
  defaultSource?: string;
  nullable?: boolean;
  readonly?: boolean;
  /** For filament_* override settings: the printer setting they override. */
  overrides?: string;
  /** Where Orca shows the setting. Absent = not shown in Orca's settings tabs. */
  ui?: { tab: PresetKind; page: string; group: string; order: number };
}

/** A profile JSON file as stored by Orca (system or user). */
export interface ProfileJson {
  name: string;
  inherits?: string;
  type?: string;
  from?: string;
  instantiation?: string;
  [key: string]: unknown;
}

/** The defaults file SideFin loads for one Orca version. */
export interface Baseline {
  schema: 1;
  orcaVersion: string;
  source: { repository: string; tag: string; commit?: string };
  generatedAt: string;
  settings: Record<string, SettingDef>;
  /** The settings each kind of preset stores, as listed in Orca's Preset.cpp. */
  presetKeys: Record<PresetKind, string[]>;
  /** Settings that hold one value per extruder variant (Orca 2.4 and later). */
  variantKeys: VariantKeys;
  /** System profiles by kind, keyed "<vendor>/<name>", unresolved (as in Orca's resources/profiles). */
  profiles: Record<PresetKind, Record<string, ProfileJson & { vendor: string }>>;
  report: { settings: number; withDefault: number; shownInOrca: number; unparsedDefaults: string[] };
}

export interface VariantKeys {
  process: string[];
  filament: string[];
  printer: string[];
  /** Two values per variant: normal and silent mode machine limits. */
  printerPairs: string[];
}

export interface BaselineIndex {
  schema: 1;
  versions: { orcaVersion: string; file: string; generatedAt: string }[];
}
