// Reads the Orca data folder in the browser. Nothing is uploaded: the files are
// read on this computer and kept in memory (goal G6). Chrome and Edge can
// remember the folder; other browsers ask for it each time. Chrome and Edge can
// also write into it (goal G4: Save, with a backup in sidefin/backup).

import { BACKUP_DIR, BACKUP_INFO, backupsToRemove, isBackupName, type BackupInfo, type FileStamp } from '../core/save';

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    queryPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
}

export interface FolderFile {
  path: string;
  text: string;
  /** Last-modified time and size when read: a save checks these to see if Orca changed the file meanwhile. */
  stamp?: FileStamp;
}

export const canPickFolder = () => typeof window.showDirectoryPicker === 'function';

/** Folders that never hold user presets, skipped to keep reading fast. */
const SKIP = /^(system|log|cache|ota|plugins|printers|hms|user_backup.*|\..*)$/i;

async function readHandle(dir: FileSystemDirectoryHandle, prefix: string, depth: number, out: FolderFile[]) {
  if (depth > 5) return;
  let entries: FileSystemHandle[] = [];
  for await (const h of dir.values()) entries.push(h);
  // In an Orca data folder, only "user" holds your presets; "sidefin" holds SideFin's own file.
  const user = entries.find((h) => h.kind === 'directory' && h.name === 'user');
  if (depth === 0 && user) entries = entries.filter((h) => h.kind === 'directory' && (h.name === 'user' || h.name === 'sidefin'));
  for (const h of entries) {
    const path = prefix ? `${prefix}/${h.name}` : h.name;
    if (path === BACKUP_DIR) continue; // SideFin's backups hold old copies of your presets
    if (h.kind === 'directory') {
      if (!SKIP.test(h.name)) await readHandle(h as FileSystemDirectoryHandle, path, depth + 1, out);
    } else if (h.name.toLowerCase().endsWith('.json')) {
      const file = await (h as FileSystemFileHandle).getFile();
      out.push({
        path,
        text: await file.text(),
        stamp: { lastModified: file.lastModified, size: file.size },
      });
    }
  }
}

export async function readFolder(dir: FileSystemDirectoryHandle): Promise<FolderFile[]> {
  const out: FolderFile[] = [];
  await readHandle(dir, '', 0, out);
  return out;
}

/** For browsers without folder access: the files of an <input webkitdirectory>. Paths are made relative to the chosen folder. */
export async function readFileList(list: FileList): Promise<FolderFile[]> {
  const files = [...list].filter((f) => f.name.toLowerCase().endsWith('.json'));
  const rel = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  const inside = (f: File) => rel(f).split('/').slice(1).join('/');
  return Promise.all(
    files
      .filter(
        (f) =>
          !rel(f)
            .split('/')
            .slice(1, -1)
            .some((p) => SKIP.test(p)) && !inside(f).startsWith(`${BACKUP_DIR}/`),
      )
      .map(async (f) => ({
        path: rel(f).split('/').slice(1).join('/') || f.name,
        text: await f.text(),
      })),
  );
}

// Remember the chosen folder between visits (Chrome and Edge only).
const DB = 'sidefin';
const STORE = 'handles';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function rememberFolder(dir: FileSystemDirectoryHandle): Promise<void> {
  try {
    const d = await db();
    d.transaction(STORE, 'readwrite').objectStore(STORE).put(dir, 'datadir');
  } catch {
    /* private window or storage blocked: the folder is simply asked again next time */
  }
}

export async function rememberedFolder(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const req = d.transaction(STORE).objectStore(STORE).get('datadir');
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

/** Ask again for read access to a remembered folder; needs a click. */
export async function allowRead(dir: FileSystemDirectoryHandle): Promise<boolean> {
  if ((await dir.queryPermission?.({ mode: 'read' })) === 'granted') return true;
  return (await dir.requestPermission?.({ mode: 'read' })) === 'granted';
}

/** Ask for permission to change files in the folder; needs a click. Chrome and Edge only. */
export async function allowWrite(dir: FileSystemDirectoryHandle): Promise<boolean> {
  if ((await dir.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true;
  return (await dir.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

export const canWrite = (dir?: FileSystemDirectoryHandle) =>
  !!dir && typeof (FileSystemFileHandle.prototype as { createWritable?: unknown }).createWritable === 'function';

const notFound = (e: unknown) => (e as Error).name === 'NotFoundError' || (e as Error).name === 'TypeMismatchError';

async function folderAt(dir: FileSystemDirectoryHandle, parts: string[], create: boolean): Promise<FileSystemDirectoryHandle | undefined> {
  let d = dir;
  for (const p of parts) {
    try {
      d = await d.getDirectoryHandle(p, { create });
    } catch (e) {
      if (notFound(e)) return undefined;
      throw e;
    }
  }
  return d;
}

async function fileAt(dir: FileSystemDirectoryHandle, path: string, create = false): Promise<FileSystemFileHandle | undefined> {
  const parts = path.split('/');
  const d = await folderAt(dir, parts.slice(0, -1), create);
  if (!d) return undefined;
  try {
    return await d.getFileHandle(parts[parts.length - 1], { create });
  } catch (e) {
    if (notFound(e)) return undefined;
    throw e;
  }
}

/** Time and size of a file now, or undefined when it is not there. */
export async function stampOf(dir: FileSystemDirectoryHandle, path: string): Promise<FileStamp | undefined> {
  const h = await fileAt(dir, path);
  if (!h) return undefined;
  const f = await h.getFile();
  return { lastModified: f.lastModified, size: f.size };
}

export async function readText(dir: FileSystemDirectoryHandle, path: string): Promise<string | undefined> {
  const h = await fileAt(dir, path);
  return h ? (await h.getFile()).text() : undefined;
}

/**
 * Write a file, making folders as needed. The browser writes to a temporary
 * file and swaps it in on close, so a crash never leaves half a file.
 */
export async function writeText(dir: FileSystemDirectoryHandle, path: string, text: string): Promise<void> {
  const h = (await fileAt(dir, path, true))!;
  const w = await h.createWritable();
  try {
    await w.write(text);
    await w.close();
  } catch (e) {
    await w.abort().catch(() => undefined);
    throw e;
  }
}

export interface Backup {
  name: string;
  info?: BackupInfo;
}

/** SideFin's backups in this folder, newest first. */
export async function listBackups(dir: FileSystemDirectoryHandle): Promise<Backup[]> {
  const d = await folderAt(dir, BACKUP_DIR.split('/'), false);
  if (!d) return [];
  const out: Backup[] = [];
  for await (const h of d.values()) {
    if (h.kind !== 'directory' || !isBackupName(h.name)) continue;
    let info: BackupInfo | undefined;
    try {
      const text = await readText(h as FileSystemDirectoryHandle, BACKUP_INFO);
      info = text ? JSON.parse(text) : undefined;
    } catch {
      info = undefined;
    }
    out.push({ name: h.name, info });
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * Copy the files as they are on disk now into a new backup folder, with a
 * backup-info.json. Files that are not there yet are listed as created.
 */
export async function makeBackup(dir: FileSystemDirectoryHandle, name: string, paths: string[], reason: string): Promise<BackupInfo> {
  const info: BackupInfo = {
    date: new Date().toISOString(),
    sidefin: __APP_VERSION__,
    reason,
    files: [],
    created: [],
  };
  for (const path of paths) {
    const text = await readText(dir, path);
    if (text === undefined) {
      info.created.push(path);
      continue;
    }
    await writeText(dir, `${BACKUP_DIR}/${name}/${path}`, text);
    info.files.push(path);
  }
  await writeText(dir, `${BACKUP_DIR}/${name}/${BACKUP_INFO}`, JSON.stringify(info, null, 4) + '\n');
  return info;
}

/** The files of one backup, as {path, text}, to put back. */
export async function backupFiles(dir: FileSystemDirectoryHandle, b: Backup): Promise<{ path: string; text: string }[]> {
  const out: { path: string; text: string }[] = [];
  for (const path of b.info?.files ?? []) {
    const text = await readText(dir, `${BACKUP_DIR}/${b.name}/${path}`);
    if (text !== undefined) out.push({ path, text });
  }
  return out;
}

/** Remove the oldest backups so that `keep` are left. Returns the names removed. */
export async function pruneBackups(dir: FileSystemDirectoryHandle, keep: number): Promise<string[]> {
  const d = await folderAt(dir, BACKUP_DIR.split('/'), false);
  if (!d) return [];
  const names = (await listBackups(dir)).map((b) => b.name);
  const gone = backupsToRemove(names, keep, 0);
  for (const n of gone) await d.removeEntry(n, { recursive: true });
  return gone;
}
