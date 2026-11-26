// Save into the Orca data folder, with a backup first (G4, step 7), and the list of
// backups with Restore.

import { useEffect, useRef, useState } from 'react';
import type { PresetFile } from '../core/presets';
import { backupDate, backupName, backupsToRemove, conflicts, KEEP_BACKUPS, showDate, showStamp, type Conflict, type FileStamp } from '../core/save';
import type { Baseline } from '../core/types';
import { useOutFiles, type Changed, type DataFile } from './Changes';
import { allowWrite, backupFiles, listBackups, makeBackup, pruneBackups, stampOf, writeText, type Backup } from './folder';

export interface SaveResult {
  /** Paths written. */
  saved: string[];
  /** Paths left as they were on disk, with your SideFin changes kept. */
  skipped: string[];
  /** The backup folder made, if any. */
  backup?: string;
  /** Old backups removed. */
  removed: string[];
  /** For the notice: "Saved" or "Restored". */
  what: string;
}

const pref = {
  get: (k: string) => {
    try {
      return localStorage.getItem(`sidefin.${k}`) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(`sidefin.${k}`, v);
    } catch {
      /* not remembered */
    }
  },
};
const keepPref = () => pref.get('keepBackups') !== 'all';

const fileName = (path: string) => path.split('/').pop() ?? path;

function CloseOrca() {
  return (
    <p className="closeorca">
      <b>Close Orca first.</b> Orca reads presets only when it starts, and saving a preset in Orca would overwrite what SideFin saves. Start Orca again
      afterwards.
    </p>
  );
}

/** The backup choices, shared by Save and Restore. */
function BackupChoice({
  existing,
  backup,
  setBackup,
  keep,
  setKeep,
  canSkip = true,
}: {
  existing: string[];
  backup: boolean;
  setBackup: (b: boolean) => void;
  keep: boolean;
  setKeep: (b: boolean) => void;
  canSkip?: boolean;
}) {
  const gone = backup && keep ? backupsToRemove(existing, KEEP_BACKUPS, 1) : [];
  const oldest = gone[0] && backupDate(gone[0]);
  return (
    <div className="backupchoice">
      {canSkip && (
        <label className="check">
          <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} />
          Make a backup first, in <code>sidefin/backup</code> inside your Orca folder.
        </label>
      )}
      {!backup && (
        <p className="warntext small">Without a backup, SideFin cannot put the old files back. Only OneDrive or Windows file history might still have them.</p>
      )}
      {backup && (
        <label className="check">
          <input
            type="checkbox"
            checked={keep}
            onChange={(e) => {
              setKeep(e.target.checked);
              pref.set('keepBackups', e.target.checked ? 'last' : 'all');
            }}
          />
          <span>
            Keep only the last {KEEP_BACKUPS} backups.
            {gone.length > 0 && (
              <span className="warntext">
                {' '}
                This removes {gone.length} older {gone.length === 1 ? 'backup' : 'backups'}
                {oldest ? ` (oldest: ${showDate(oldest)})` : ''}.
              </span>
            )}
            {existing.length > 0 && !gone.length && <span className="muted"> You have {existing.length} now.</span>}
          </span>
        </label>
      )}
    </div>
  );
}

/** Files that changed on disk since SideFin read them, each with Skip or Overwrite anyway. */
function Conflicts({
  list,
  choice,
  setChoice,
  names,
}: {
  list: Conflict[];
  choice: Record<string, 'skip' | 'overwrite'>;
  setChoice: (c: Record<string, 'skip' | 'overwrite'>) => void;
  names: Record<string, string>;
}) {
  if (!list.length) return null;
  return (
    <div className="conflicts">
      <p className="warntext small">
        {list.length === 1 ? 'This file' : `These ${list.length} files`} changed on disk after SideFin read {list.length === 1 ? 'it' : 'them'}, probably in
        Orca:
      </p>
      <table className="small">
        <tbody>
          {list.map((c) => (
            <tr key={c.path}>
              <td>
                <b>{names[c.path] ?? fileName(c.path)}</b>
                <div className="muted">
                  read: {showStamp(c.read)} · now on disk: {showStamp(c.now)}
                </div>
              </td>
              <td className="pick">
                <div className="seg">
                  <button className={choice[c.path] !== 'overwrite' ? 'on' : ''} onClick={() => setChoice({ ...choice, [c.path]: 'skip' })}>
                    Skip this file
                  </button>
                  <button className={choice[c.path] === 'overwrite' ? 'on' : ''} onClick={() => setChoice({ ...choice, [c.path]: 'overwrite' })}>
                    Overwrite anyway
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Skip keeps your SideFin changes to that file, unsaved. With a backup, the newer file from disk goes into it first, so Overwrite can be undone.
      </p>
    </div>
  );
}

async function stampsNow(dir: FileSystemDirectoryHandle, paths: string[]) {
  return Object.fromEntries(await Promise.all(paths.map(async (p) => [p, await stampOf(dir, p)] as const)));
}

export function SaveDialog({
  baseline,
  originals,
  changed,
  dataFile,
  dir,
  stamps,
  onSaved,
  onClose,
}: {
  baseline: Baseline;
  originals: PresetFile[];
  changed: Changed[];
  dataFile?: DataFile;
  dir: FileSystemDirectoryHandle;
  stamps: Record<string, FileStamp | undefined>;
  onSaved: (r: SaveResult) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  const { out, view } = useOutFiles(baseline, originals, changed, dataFile);
  const [backup, setBackup] = useState(true);
  const [keep, setKeep] = useState(keepPref);
  const [existing, setExisting] = useState<string[]>([]);
  const [found, setFound] = useState<Conflict[]>([]);
  const [choice, setChoice] = useState<Record<string, 'skip' | 'overwrite'>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const names = Object.fromEntries(originals.map((p) => [p.path, p.json.name]));
  const paths = out().map((f) => f.path);

  const check = async () => conflicts(paths, stamps, await stampsNow(dir, paths));
  useEffect(() => {
    listBackups(dir).then(
      (b) => setExisting(b.map((x) => x.name)),
      () => undefined,
    );
    check().then(setFound, () => undefined);
  }, []);

  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (!(await allowWrite(dir))) {
        setError('SideFin did not get permission to change files in this folder. Click Save again and choose "Edit files" (or "Allow").');
        return;
      }
      // Check again: Orca may have saved something while this dialog was open.
      const now = await check();
      const fresh = now.filter((c) => !found.some((f) => f.path === c.path));
      if (fresh.length) {
        setFound(now);
        setError('Another file changed on disk just now. Choose what to do with it, then Save again.');
        return;
      }
      const skip = new Set(now.filter((c) => choice[c.path] !== 'overwrite').map((c) => c.path));
      const files = out().filter((f) => !skip.has(f.path));
      if (!files.length) {
        setError('Every file is skipped, so there is nothing to save.');
        return;
      }
      let name: string | undefined;
      let removed: string[] = [];
      if (backup) {
        name = backupName();
        await makeBackup(
          dir,
          name,
          files.map((f) => f.path),
          'save',
        );
        if (keep) removed = await pruneBackups(dir, KEEP_BACKUPS);
      }
      for (const f of files) await writeText(dir, f.path, f.text);
      onSaved({
        saved: files.map((f) => f.path),
        skipped: [...skip],
        backup: name,
        removed,
        what: 'Saved',
      });
      onClose();
    } catch (e) {
      setError(`Saving stopped: ${(e as Error).message}. Files saved before this point are on disk; the rest are unchanged.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={dialog} className="editor export" onClose={onClose} onCancel={onClose}>
      <h3>Save into "{dir.name}"</h3>
      <CloseOrca />
      {view}
      <Conflicts list={found} choice={choice} setChoice={setChoice} names={names} />
      <BackupChoice existing={existing} backup={backup} setBackup={setBackup} keep={keep} setKeep={setKeep} />
      {error && <p className="error small">{error}</p>}
      <div className="actions">
        <button className="primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

export function BackupsDialog({
  dir,
  unsaved,
  names,
  onRestored,
  onDownload,
  onClose,
}: {
  dir: FileSystemDirectoryHandle;
  /** Restore waits until there are no unsaved changes. */
  unsaved: boolean;
  /** Preset names by path, for showing. */
  names: Record<string, string>;
  onRestored: (r: SaveResult) => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  const [list, setList] = useState<Backup[]>();
  const [open, setOpen] = useState<string>();
  const [keep, setKeep] = useState(keepPref);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    listBackups(dir).then(setList, (e) => setError(`Could not read the backups (${(e as Error).message}).`));
  }, []);

  const restore = async (b: Backup) => {
    setBusy(true);
    setError(undefined);
    try {
      if (!(await allowWrite(dir))) {
        setError('SideFin did not get permission to change files in this folder.');
        return;
      }
      const files = await backupFiles(dir, b);
      if (!files.length) {
        setError('This backup holds no files.');
        return;
      }
      // A restore is a save too: back up what is on disk now first.
      const name = backupName();
      await makeBackup(
        dir,
        name,
        files.map((f) => f.path),
        `restore of ${b.name}`,
      );
      const removed = keep ? await pruneBackups(dir, KEEP_BACKUPS) : [];
      for (const f of files) await writeText(dir, f.path, f.text);
      onRestored({
        saved: files.map((f) => f.path),
        skipped: [],
        backup: name,
        removed,
        what: 'Restored',
      });
      onClose();
    } catch (e) {
      setError(`Restore stopped: ${(e as Error).message}.`);
    } finally {
      setBusy(false);
    }
  };

  const label = (p: string) => names[p] ?? p;
  return (
    <dialog ref={dialog} className="editor export" onClose={onClose} onCancel={onClose}>
      <h3>Backups</h3>
      <p className="small">
        Every save first copies the files it changes to <code>sidefin/backup</code> in "{dir.name}". Restore puts the files of a backup back.
      </p>
      {!list && !error && <p className="muted small">Reading the backups…</p>}
      {list && list.length === 0 && <p className="muted small">No backups yet. The first save makes one.</p>}
      {list && list.length > 0 && (
        <ol className="backups small">
          {list.map((b) => {
            const d = backupDate(b.name);
            const isOpen = open === b.name;
            return (
              <li key={b.name}>
                <button className="linkbtn" onClick={() => setOpen(isOpen ? undefined : b.name)}>
                  {d ? showDate(d) : b.name}
                </button>{' '}
                <span className="muted">
                  · {b.info?.reason ?? 'save'} · {b.info?.files.length ?? 0} {b.info?.files.length === 1 ? 'file' : 'files'}
                </span>
                {isOpen && (
                  <div className="bk">
                    <ul>
                      {(b.info?.files ?? []).map((p) => (
                        <li key={p}>{label(p)}</li>
                      ))}
                    </ul>
                    {!!b.info?.created.length && (
                      <p className="muted">
                        That save also created {b.info.created.map(label).join(', ')}; Restore leaves {b.info.created.length === 1 ? 'it' : 'them'} in place.
                      </p>
                    )}
                    <CloseOrca />
                    {unsaved ? (
                      <p className="warntext">Save or discard your changes in SideFin first.</p>
                    ) : (
                      <>
                        <BackupChoice existing={list.map((x) => x.name)} backup setBackup={() => undefined} keep={keep} setKeep={setKeep} canSkip={false} />
                        <p className="muted">The files as they are now are backed up first, so a restore can be undone too.</p>
                        <button className="primary" onClick={() => restore(b)} disabled={busy}>
                          {busy ? 'Restoring…' : `Restore ${b.info?.files.length ?? 0} ${b.info?.files.length === 1 ? 'file' : 'files'}`}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {error && <p className="error small">{error}</p>}
      <div className="actions">
        <button onClick={onDownload} title="Download all your presets, as they are in the folder, as a zip">
          Download a zip of all presets
        </button>
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}
