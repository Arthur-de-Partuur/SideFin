// Finds the user presets in an Orca data folder and groups them: one family
// per preset name without its nozzle size, one member per nozzle.
//   "TPU AzureFilm 0.40 @VC31E" and "TPU AzureFilm 0.60 @VC31E"  ->  family "TPU AzureFilm @VC31E"

import type { PresetKind, ProfileJson } from './types';

export interface PresetFile {
  kind: PresetKind;
  /** Path inside the chosen folder, with forward slashes. */
  path: string;
  json: ProfileJson;
}

const FOLDER_KIND: Record<string, PresetKind> = { machine: 'printer', filament: 'filament', process: 'process' };

/**
 * Pick the preset files out of a list of files from the chosen folder.
 * The kind comes from the folder name (machine, filament, process) or, failing
 * that, the "type" in the file. Orca's own copies of system profiles are skipped.
 */
export function collectPresets(files: { path: string; text: string }[]): { presets: PresetFile[]; skipped: string[] } {
  const presets: PresetFile[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    const path = f.path.replace(/\\/g, '/');
    if (!path.toLowerCase().endsWith('.json')) continue;
    const parts = path.split('/');
    if (parts.some((p) => /^(system|user_backup.*|log|cache|ota|plugins|printers|hms)$/i.test(p))) continue;
    if (path.startsWith('sidefin/')) continue; // SideFin's own file and its backups
    let json: ProfileJson;
    try {
      json = JSON.parse(f.text);
    } catch {
      skipped.push(`${path}: not valid JSON`);
      continue;
    }
    if (!json || typeof json !== 'object' || typeof json.name !== 'string') continue;
    const folder = parts.slice(0, -1).reverse().find((p) => p in FOLDER_KIND);
    const kind = folder ? FOLDER_KIND[folder] : FOLDER_KIND[json.type ?? ''];
    if (!kind) continue;
    presets.push({ kind, path, json });
  }
  return { presets, skipped };
}

/** A nozzle size written in a name, such as "0.40" or "0.6", but not a layer height such as "0.20mm". */
const NOZZLE_IN_NAME = /(?:^|\s)(\d\.\d{1,2})(?!\d|\s*mm)(?=\s|$)/;

/** Nozzle size of a preset as a number string ("0.4"), or undefined when it fits any nozzle. */
export function nozzleOf(kind: PresetKind, json: ProfileJson, nozzleDiameter?: unknown): string | undefined {
  const norm = (s: string) => String(Number(s));
  if (kind === 'printer') {
    const d = Array.isArray(nozzleDiameter) ? nozzleDiameter[0] : nozzleDiameter;
    if (typeof d === 'string' && d) return norm(d);
  }
  const cond = typeof json.compatible_printers_condition === 'string' ? json.compatible_printers_condition : '';
  const c = cond.match(/nozzle_diameter\[0\]\s*==\s*(\d*\.?\d+)/);
  if (c) return norm(c[1]);
  const n = json.name.match(NOZZLE_IN_NAME);
  if (n) return norm(n[1]);
  return undefined;
}

/** The name without its nozzle size: the family the preset belongs to. */
export function familyOf(name: string): string {
  return name
    .replace(NOZZLE_IN_NAME, ' ')
    .replace(/\s+nozzle\b/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether a filament or process preset can be used with a printer, following
 * the patterns Orca profiles use in compatible_printers_condition:
 *   printer_notes=~/.*X.*\/ and nozzle_diameter[0]==0.4
 * Terms SideFin does not understand count as true, so presets are rather shown than hidden.
 */
export function isCompatible(json: ProfileJson, printer: { name: string; notes: string; nozzle?: string; inherits?: string }): boolean {
  const list = json.compatible_printers;
  if (Array.isArray(list) && list.length > 0) {
    return list.includes(printer.name) || (printer.inherits !== undefined && list.includes(printer.inherits));
  }
  const cond = typeof json.compatible_printers_condition === 'string' ? json.compatible_printers_condition.trim() : '';
  if (!cond) return true;
  return cond.split(/\s+or\s+|\|\|/).some((alt) => alt.split(/\s+and\s+|&&/).every((term) => evalTerm(term.trim(), printer)));
}

function evalTerm(term: string, p: { notes: string; nozzle?: string }): boolean {
  const t = term.replace(/^\(+|\)+$/g, '').trim();
  const notes = t.match(/^(!?)printer_notes\s*(=~|!~)\s*\/(.*)\/$/);
  if (notes) {
    let re: RegExp;
    try {
      re = new RegExp(notes[3]);
    } catch {
      return true;
    }
    const hit = re.test(p.notes);
    return (notes[2] === '=~') !== (notes[1] === '!') ? hit : !hit;
  }
  const noz = t.match(/^nozzle_diameter\[0\]\s*(==|!=)\s*(\d*\.?\d+)$/);
  if (noz && p.nozzle !== undefined) {
    const same = Number(noz[2]) === Number(p.nozzle);
    return noz[1] === '==' ? same : !same;
  }
  return true;
}
