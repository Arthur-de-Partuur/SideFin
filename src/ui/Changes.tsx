import { useEffect, useRef, useState } from 'react';
import { changedKeys, obsoleteKeys, orcaJson } from '../core/edit';
import { zip } from '../core/export';
import type { PresetFile } from '../core/presets';
import type { Baseline, ProfileJson } from '../core/types';
import { download } from './download';

const fileName = (path: string) => path.split('/').pop() ?? path;
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');

/** The bar that shows unsaved changes, with undo, discard and export. */
export function Changes({
  baseline,
  originals,
  current,
  canUndo,
  onUndo,
  onDiscard,
}: {
  baseline: Baseline;
  originals: PresetFile[];
  /** The edited version of each changed preset, by path. */
  current: Record<string, ProfileJson>;
  canUndo: boolean;
  onUndo: () => void;
  onDiscard: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const changed = originals
    .filter((p) => current[p.path])
    .map((p) => ({ file: p, json: current[p.path], keys: changedKeys(p.json, current[p.path]) }))
    .filter((c) => c.keys.length > 0);
  const count = changed.reduce((n, c) => n + c.keys.length, 0);
  if (!changed.length && !canUndo) return null;
  return (
    <div className="changes" role="status">
      <span>
        {count} {count === 1 ? 'change' : 'changes'} in {changed.length} {changed.length === 1 ? 'preset' : 'presets'}, not exported yet
      </span>
      <button onClick={onUndo} disabled={!canUndo}>
        Undo
      </button>
      <button onClick={onDiscard} disabled={!changed.length}>
        Discard all
      </button>
      <button className="primary" onClick={() => setExporting(true)} disabled={!changed.length}>
        Export…
      </button>
      {exporting && <ExportDialog baseline={baseline} originals={originals} changed={changed} onClose={() => setExporting(false)} />}
    </div>
  );
}

function ExportDialog({
  baseline,
  originals,
  changed,
  onClose,
}: {
  baseline: Baseline;
  originals: PresetFile[];
  changed: { file: PresetFile; json: ProfileJson; keys: string[] }[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  const [cleanup, setCleanup] = useState(true);
  const [cleanOthers, setCleanOthers] = useState(false);

  const others = originals
    .filter((p) => !changed.some((c) => c.file.path === p.path))
    .map((p) => ({ file: p, json: p.json, keys: [] as string[], obsolete: obsoleteKeys(baseline, p.json) }))
    .filter((p) => p.obsolete.length > 0);
  const files = [
    ...changed.map((c) => ({ ...c, obsolete: obsoleteKeys(baseline, c.json) })),
    ...(cleanup && cleanOthers ? others : []),
  ];
  const obsoleteCount = (list: { obsolete: string[] }[]) => list.reduce((n, f) => n + f.obsolete.length, 0);

  const go = () => {
    const out = files.map((f) => ({ path: f.file.path, text: orcaJson(f.json, cleanup ? f.obsolete : []) }));
    if (out.length === 1) download(fileName(out[0].path), out[0].text, 'application/json');
    else download(`sidefin-export-${stamp()}.zip`, zip(out), 'application/zip');
    onClose();
  };

  return (
    <dialog ref={dialog} className="editor export" onClose={onClose} onCancel={onClose}>
      <h3>Export changed presets</h3>
      <ol className="small">
        {files.map((f) => (
          <li key={f.file.path}>
            <b>{f.file.json.name}</b>
            {f.keys.length > 0 && <span className="muted"> · changed: {f.keys.join(', ')}</span>}
            {cleanup && f.obsolete.length > 0 && <span className="muted"> · removed: {f.obsolete.join(', ')}</span>}
          </li>
        ))}
      </ol>
      {(obsoleteCount(changed.map((c) => ({ obsolete: obsoleteKeys(baseline, c.json) }))) > 0 || others.length > 0) && (
        <label className="check">
          <input type="checkbox" checked={cleanup} onChange={(e) => setCleanup(e.target.checked)} />
          Remove settings that Orca {baseline.orcaVersion} does not know ({obsoleteCount(files.filter((f) => f.keys.length))} in the changed presets). Orca ignores them.
        </label>
      )}
      {cleanup && others.length > 0 && (
        <label className="check">
          <input type="checkbox" checked={cleanOthers} onChange={(e) => setCleanOthers(e.target.checked)} />
          Also clean up {others.length} unchanged presets that hold such settings ({obsoleteCount(others)} settings).
        </label>
      )}
      <p className="small">
        {files.length === 1 ? 'You get one .json file.' : 'You get a .zip with the files in their folders.'} Close Orca, then copy{' '}
        {files.length === 1 ? 'it' : 'the folders'} into your Orca data folder, replacing the old {files.length === 1 ? 'file' : 'files'}. Make a backup first
        (the Backup button at the top).
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
