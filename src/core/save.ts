// Saving straight into the Orca data folder (G4, step 7): the backup folder names,
// which old backups to remove, and which files changed on disk since SideFin read them.
// The browser part (reading and writing files) is in src/ui/folder.ts.

/** Where SideFin keeps its backups, inside the Orca data folder. */
export const BACKUP_DIR = 'sidefin/backup';
/** Written into each backup folder: what was saved, and which files did not exist before. */
export const BACKUP_INFO = 'backup-info.json';
/** "Keep only the last N backups". */
export const KEEP_BACKUPS = 10;

/** Last-modified time (ms) and size (bytes) of a file when SideFin read it. */
export interface FileStamp {
  lastModified: number;
  size: number;
}

export interface BackupInfo {
  /** When the backup was made (ISO). */
  date: string;
  sidefin: string;
  /** "save" or "restore of <backup name>". */
  reason: string;
  /** Files copied into the backup, as they were on disk before the save. */
  files: string[];
  /** Files the save created: they had no earlier version to back up. */
  created: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Folder name of a backup, in local time, sortable: "2026-11-26 16.05.12". */
export function backupName(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
}

const NAME = /^\d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d$/;

/** True for a folder name SideFin made; other folders in the backup folder are never touched. */
export const isBackupName = (name: string) => NAME.test(name);

/** The date of a backup folder name, for showing ("26 Nov 2026, 16:05"). */
export function backupDate(name: string): Date | undefined {
  const m = name.match(/^(\d{4})-(\d\d)-(\d\d) (\d\d)\.(\d\d)\.(\d\d)$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : undefined;
}

/**
 * The backups to remove so that, after adding `adding` new ones, only `keep` are left.
 * Oldest first. Only SideFin's own backup folders count.
 */
export function backupsToRemove(existing: string[], keep = KEEP_BACKUPS, adding = 1): string[] {
  const own = existing.filter(isBackupName).sort();
  const extra = own.length + adding - keep;
  return extra > 0 ? own.slice(0, extra) : [];
}

export interface Conflict {
  path: string;
  read?: FileStamp;
  now?: FileStamp;
}

/**
 * Files that changed on disk since SideFin read them: a different time or size,
 * removed since, or (for a file SideFin did not find) created since.
 */
export function conflicts(paths: string[], read: Record<string, FileStamp | undefined>, now: Record<string, FileStamp | undefined>): Conflict[] {
  const out: Conflict[] = [];
  for (const path of paths) {
    const a = read[path];
    const b = now[path];
    if (!a && !b) continue;
    if (a && b && a.lastModified === b.lastModified && a.size === b.size) continue;
    out.push({ path, read: a, now: b });
  }
  return out;
}

/** "26 Nov 2026, 16:05" */
export function showDate(d: Date | number): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  return `${x.getDate()} ${x.toLocaleString('en-GB', { month: 'short' })} ${x.getFullYear()}, ${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

/** "16:05, 2,431 bytes" or "not there" */
export function showStamp(s: FileStamp | undefined, today = new Date()): string {
  if (!s) return 'not there';
  const d = new Date(s.lastModified);
  const sameDay = d.toDateString() === today.toDateString();
  return `${sameDay ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : showDate(d)}, ${s.size.toLocaleString('en-US')} bytes`;
}
