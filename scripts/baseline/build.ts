// Builds the defaults file SideFin loads for one OrcaSlicer release.
//
//   npm run baseline -- v2.5.2             build one release
//   npm run baseline -- v2.4.2 v2.5.2      build several
//   npm run baseline -- --latest           build the newest release if it is missing
//   npm run baseline -- v2.5.2 --src DIR   use an Orca checkout that is already on disk
//
// It reads Orca's source at that tag: the setting definitions and built-in
// defaults (PrintConfig.cpp), where each setting is shown (Tab.cpp), and the
// RatRig and Orca filament library system profiles. It writes
// public/baseline/<version>.json and updates public/baseline/index.json.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Baseline, BaselineIndex, PresetKind, ProfileJson } from '../../src/core/types';
import { parsePrintConfig, readConstants } from './parsePrintConfig';
import { parsePresetKeys } from './parsePreset';
import { parseTab } from './parseTab';

const REPO = 'https://github.com/OrcaSlicer/OrcaSlicer';
const ROOT = resolve(import.meta.dirname, '../..');
const CACHE = join(ROOT, '.orca-src');
const OUT = join(ROOT, 'public', 'baseline');

/** Vendor folders read from resources/profiles. */
const VENDORS = ['Ratrig', 'OrcaFilamentLibrary'];
const SOURCES = [
  'src/libslic3r/PrintConfig.cpp',
  'src/libslic3r/PrintConfigConstants.hpp',
  'src/libslic3r/Preset.cpp',
  'src/slic3r/GUI/Tab.cpp',
  ...VENDORS.map((v) => `resources/profiles/${v}`),
  ...VENDORS.map((v) => `resources/profiles/${v}.json`),
];

const KIND: Record<string, PresetKind> = { machine: 'printer', filament: 'filament', process: 'process' };

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Release tags such as v2.5.2, newest first. Betas and release candidates are left out. */
export function releaseTags(lsRemote: string): string[] {
  const tags = [...lsRemote.matchAll(/refs\/tags\/(v\d+\.\d+\.\d+)$/gm)].map((m) => m[1]);
  return [...new Set(tags)].sort((a, b) => compareVersions(b, a));
}

/** Compare "2.4.2" and "v2.5.2" style versions: negative when a is older. */
export function compareVersions(a: string, b: string): number {
  const num = (t: string) => t.replace(/^v/, '').split('.').map(Number);
  const [x, y] = [num(a), num(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Sparse, shallow checkout of only the files the builder reads. */
function fetchTag(tag: string): string {
  const dir = join(CACHE, tag);
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(CACHE, { recursive: true });
    console.log(`Fetching OrcaSlicer ${tag} ...`);
    git(['clone', '--quiet', '--depth', '1', '--filter=blob:none', '--sparse', '--branch', tag, `${REPO}.git`, dir]);
  }
  git(['sparse-checkout', 'set', '--no-cone', ...SOURCES.map((s) => `/${s}`)], dir);
  return dir;
}

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return jsonFiles(p);
    return name.endsWith('.json') ? [p] : [];
  });
}

/**
 * Read the system profiles of one vendor folder. Keys are "<vendor>/<name>":
 * vendors may use the same base name (fdm_filament_abs), and Orca looks in the
 * profile's own vendor first, then in the Orca filament library.
 */
export function readProfiles(profilesDir: string, vendor: string, into: Baseline['profiles'], skipped: string[]) {
  for (const file of jsonFiles(join(profilesDir, vendor))) {
    let json: ProfileJson;
    try {
      json = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      skipped.push(`${vendor}: unreadable ${file}`);
      continue;
    }
    const kind = KIND[json.type ?? ''];
    if (!kind || !json.name) continue; // machine_model files and the like
    const key = `${vendor}/${json.name}`;
    if (key in into[kind]) {
      skipped.push(`${vendor}: duplicate ${kind} "${json.name}"`);
      continue;
    }
    into[kind][key] = { ...json, vendor };
  }
}

export function buildBaseline(srcDir: string, tag: string, commit?: string): Baseline {
  const read = (p: string) => readFileSync(join(srcDir, p), 'utf8');
  const constants = existsSync(join(srcDir, 'src/libslic3r/PrintConfigConstants.hpp'))
    ? readConstants(read('src/libslic3r/PrintConfigConstants.hpp'))
    : {};
  const printConfig = read('src/libslic3r/PrintConfig.cpp');
  const { settings, unparsedDefaults } = parsePrintConfig(printConfig, constants);
  const presetKeys = parsePresetKeys(read('src/libslic3r/Preset.cpp'), printConfig);
  for (const kind of Object.keys(presetKeys) as PresetKind[]) {
    presetKeys[kind] = presetKeys[kind].filter((k) => k in settings);
  }
  const ui = parseTab(read('src/slic3r/GUI/Tab.cpp'), new Set(Object.keys(settings)));
  for (const [key, place] of Object.entries(ui)) settings[key].ui = place;

  const profiles: Baseline['profiles'] = { printer: {}, filament: {}, process: {} };
  const skipped: string[] = [];
  for (const v of VENDORS) readProfiles(join(srcDir, 'resources/profiles'), v, profiles, skipped);
  if (skipped.length) console.warn(`  ${skipped.length} profile files skipped:\n    ${skipped.join('\n    ')}`);

  const all = Object.values(settings);
  return {
    schema: 1,
    orcaVersion: tag.replace(/^v/, ''),
    source: { repository: REPO, tag, ...(commit ? { commit } : {}) },
    generatedAt: new Date().toISOString(),
    settings,
    presetKeys,
    profiles,
    report: {
      settings: all.length,
      withDefault: all.filter((s) => s.default !== undefined).length,
      shownInOrca: all.filter((s) => s.ui).length,
      unparsedDefaults,
    },
  };
}

function writeBaseline(b: Baseline) {
  mkdirSync(OUT, { recursive: true });
  const file = `${b.orcaVersion}.json`;
  writeFileSync(join(OUT, file), JSON.stringify(b));
  const indexPath = join(OUT, 'index.json');
  const index: BaselineIndex = existsSync(indexPath)
    ? JSON.parse(readFileSync(indexPath, 'utf8'))
    : { schema: 1, versions: [] };
  index.versions = index.versions.filter((v) => v.orcaVersion !== b.orcaVersion);
  index.versions.push({ orcaVersion: b.orcaVersion, file, generatedAt: b.generatedAt });
  index.versions.sort((x, y) => compareVersions(y.orcaVersion, x.orcaVersion)); // newest first
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  const r = b.report;
  console.log(
    `Orca ${b.orcaVersion}: ${r.settings} settings, ${r.withDefault} with a default, ${r.shownInOrca} shown in Orca, ` +
      `${Object.keys(b.profiles.printer).length}/${Object.keys(b.profiles.filament).length}/${Object.keys(b.profiles.process).length} printer/filament/process profiles` +
      (r.unparsedDefaults.length ? `; default not read for: ${r.unparsedDefaults.join(', ')}` : ''),
  );
}

function main() {
  const args = process.argv.slice(2);
  const srcIdx = args.indexOf('--src');
  const src = srcIdx >= 0 ? resolve(args[srcIdx + 1]) : undefined;
  let tags = args.filter((a, i) => !a.startsWith('--') && (srcIdx < 0 || i !== srcIdx + 1));

  if (args.includes('--latest')) {
    const latest = releaseTags(git(['ls-remote', '--tags', `${REPO}.git`]))[0];
    if (existsSync(join(OUT, `${latest.slice(1)}.json`))) {
      console.log(`Orca ${latest} is already built.`);
      return;
    }
    tags = [latest];
  }
  if (tags.length === 0) {
    console.error('Name a release tag, for example: npm run baseline -- v2.5.2');
    process.exit(1);
  }
  if (src && tags.length > 1) {
    console.error('--src works with one tag at a time.');
    process.exit(1);
  }
  for (const tag of tags) {
    const dir = src ?? fetchTag(tag);
    const commit = existsSync(join(dir, '.git')) ? git(['rev-parse', 'HEAD'], dir) : undefined;
    writeBaseline(buildBaseline(dir, tag, commit));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
