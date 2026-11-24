// Reads the Orca data folder in the browser. Nothing is uploaded: the files are
// read on this computer and kept in memory (goal G6). Chrome and Edge can
// remember the folder; other browsers ask for it each time.

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
}

export const canPickFolder = () => typeof window.showDirectoryPicker === 'function';

/** Folders that never hold user presets, skipped to keep reading fast. */
const SKIP = /^(system|log|cache|ota|plugins|printers|hms|user_backup.*|\..*)$/i;

async function readHandle(dir: FileSystemDirectoryHandle, prefix: string, depth: number, out: FolderFile[]) {
  if (depth > 5) return;
  // In an Orca data folder, only the "user" folder holds your presets.
  let entries: FileSystemHandle[] = [];
  for await (const h of dir.values()) entries.push(h);
  const user = entries.find((h) => h.kind === 'directory' && h.name === 'user');
  if (depth === 0 && user) entries = [user];
  for (const h of entries) {
    const path = prefix ? `${prefix}/${h.name}` : h.name;
    if (h.kind === 'directory') {
      if (!SKIP.test(h.name)) await readHandle(h as FileSystemDirectoryHandle, path, depth + 1, out);
    } else if (h.name.toLowerCase().endsWith('.json')) {
      const file = await (h as FileSystemFileHandle).getFile();
      out.push({ path, text: await file.text() });
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
  return Promise.all(files.filter((f) => !rel(f).split('/').slice(1, -1).some((p) => SKIP.test(p))).map(async (f) => ({ path: rel(f).split('/').slice(1).join('/') || f.name, text: await f.text() })));
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
