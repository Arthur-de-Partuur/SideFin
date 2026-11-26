import { useEffect, useRef, useState } from 'react';
import { changedKeys, obsoleteKeys, orcaJson } from '../core/edit';
import { zip } from '../core/export';
import type { PresetFile } from '../core/presets';
import type { Baseline, ProfileJson } from '../core/types';
import type { FileStamp } from '../core/save';
import { download } from './download';
import { SaveDialog, type SaveResult } from './Save';

const fileName = (path: string) => path.split('/').pop() ?? path;
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');

/** The bar that shows unsaved changes, with undo, discard and save (or export where the browser cannot write). */
export function Changes({
  baseline,
  originals,
  current,
  dataFile,
  canUndo,
  onUndo,
  onDiscard,
  dir,
  stamps,
  onSaved,
}: {
  baseline: Baseline;
  originals: PresetFile[];
  /** The edited version of each changed preset, by path. */
  current: Record<string, ProfileJson>;
  /** SideFin's own file (advice, calibration log), when it changed. */
  dataFile?: DataFile;
  canUndo: boolean;
  onUndo: () => void;
  onDiscard: () => void;
  /** The folder, when this browser can write into it: then Save replaces Export. */
  dir?: FileSystemDirectoryHandle;
  /** Time and size of each file when read. */
  stamps: Record<string, FileStamp | undefined>;
  onSaved: (r: SaveResult) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const changed = originals
    .filter((p) => current[p.path])
    .map((p) => ({
      file: p,
      json: current[p.path],
      keys: changedKeys(p.json, current[p.path]),
    }))
    .filter((c) => c.keys.length > 0);
  const count = changed.reduce((n, c) => n + c.keys.length, 0);
  if (!changed.length && !dataFile && !canUndo) return null;
  const any = changed.length > 0 || !!dataFile;
  return (
    <div className="changes" role="status">
      <span>
        {changed.length > 0 && `${count} ${count === 1 ? 'change' : 'changes'} in ${changed.length} ${changed.length === 1 ? 'preset' : 'presets'}`}
        {changed.length > 0 && dataFile && ' and '}
        {dataFile && 'manufacturer advice or calibration log'}
        {!any && 'No changes'}
        {any && (dir ? ', not saved yet' : ', not exported yet')}
      </span>
      <button onClick={onUndo} disabled={!canUndo}>
        Undo
      </button>
      <button onClick={onDiscard} disabled={!any}>
        Discard all
      </button>
      <button className="primary" onClick={() => setExporting(true)} disabled={!any}>
        {dir ? 'Save…' : 'Export…'}
      </button>
      {exporting && dir && (
        <SaveDialog
          baseline={baseline}
          originals={originals}
          changed={changed}
          dataFile={dataFile}
          dir={dir}
          stamps={stamps}
          onSaved={onSaved}
          onClose={() => setExporting(false)}
        />
      )}
      {exporting && !dir && (
        <ExportDialog baseline={baseline} originals={originals} changed={changed} dataFile={dataFile} onClose={() => setExporting(false)} />
      )}
    </div>
  );
}

export type Changed = { file: PresetFile; json: ProfileJson; keys: string[] };
export type DataFile = { path: string; text: string; isNew: boolean };

/** The files a save or export writes, with the choice to drop settings Orca no longer knows. */
export function useOutFiles(baseline: Baseline, originals: PresetFile[], changed: Changed[], dataFile?: DataFile) {
  const [cleanup, setCleanup] = useState(true);
  const [cleanOthers, setCleanOthers] = useState(false);
  const others = originals
    .filter((p) => !changed.some((c) => c.file.path === p.path))
    .map((p) => ({
      file: p,
      json: p.json,
      keys: [] as string[],
      obsolete: obsoleteKeys(baseline, p.json),
    }))
    .filter((p) => p.obsolete.length > 0);
  const files = [...changed.map((c) => ({ ...c, obsolete: obsoleteKeys(baseline, c.json) })), ...(cleanup && cleanOthers ? others : [])];
  const obsoleteCount = (list: { obsolete: string[] }[]) => list.reduce((n, f) => n + f.obsolete.length, 0);
  const out = () => {
    const list = files.map((f) => ({
      path: f.file.path,
      text: orcaJson(f.json, cleanup ? f.obsolete : []),
    }));
    if (dataFile) list.push({ path: dataFile.path, text: dataFile.text });
    return list;
  };
  const view = (
    <>
      <ol className="small">
        {files.map((f) => (
          <li key={f.file.path}>
            <b>{f.file.json.name}</b>
            {f.keys.length > 0 && <span className="muted"> · changed: {f.keys.join(', ')}</span>}
            {cleanup && f.obsolete.length > 0 && <span className="muted"> · removed: {f.obsolete.join(', ')}</span>}
          </li>
        ))}
        {dataFile && (
          <li>
            <b>sidefin/sidefin.json</b>
            <span className="muted">
              {' '}
              · manufacturer advice, calibration log and hardware
              {dataFile.isNew ? ' (new file)' : ''}
            </span>
          </li>
        )}
      </ol>
      {(obsoleteCount(changed.map((c) => ({ obsolete: obsoleteKeys(baseline, c.json) }))) > 0 || others.length > 0) && (
        <label className="check">
          <input type="checkbox" checked={cleanup} onChange={(e) => setCleanup(e.target.checked)} />
          Remove settings that Orca {baseline.orcaVersion} does not know ({obsoleteCount(files.filter((f) => f.keys.length))} in the changed presets). Orca
          ignores them.
        </label>
      )}
      {cleanup && others.length > 0 && (
        <label className="check">
          <input type="checkbox" checked={cleanOthers} onChange={(e) => setCleanOthers(e.target.checked)} />
          Also clean up {others.length} unchanged presets that hold such settings ({obsoleteCount(others)} settings).
        </label>
      )}
    </>
  );
  return { files, out, view };
}

function ExportDialog({
  baseline,
  originals,
  changed,
  dataFile,
  onClose,
}: {
  baseline: Baseline;
  originals: PresetFile[];
  changed: Changed[];
  dataFile?: DataFile;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  const { files, out: outFiles, view } = useOutFiles(baseline, originals, changed, dataFile);

  const go = () => {
    const out = outFiles();
    if (out.length === 1 && !dataFile) download(fileName(out[0].path), out[0].text, 'application/json');
    else download(`sidefin-export-${stamp()}.zip`, zip(out), 'application/zip');
    onClose();
  };

  return (
    <dialog ref={dialog} className="editor export" onClose={onClose} onCancel={onClose}>
      <h3>Export changes</h3>
      <p className="small muted">This browser cannot save into folders; Chrome and Edge can. You get the files to copy yourself.</p>
      {view}
      <p className="small">
        {files.length === 1 && !dataFile ? 'You get one .json file.' : 'You get a .zip with the files in their folders.'} Close Orca, then copy{' '}
        {files.length === 1 && !dataFile ? 'it' : 'the folders'} into your Orca data folder, replacing the old{' '}
        {files.length === 1 && !dataFile ? 'file' : 'files'}. Make a backup first (the Backup button at the top).
      </p>
      <div className="actions">
        <button className="primary" onClick={go}>
          Download
        </button>
        <button className="ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

/** Zip of the preset files exactly as read from the folder. */
export function backup(files: { path: string; text: string }[], folder: string) {
  download(`${folder}-presets-backup-${stamp()}.zip`, zip(files), 'application/zip');
}
