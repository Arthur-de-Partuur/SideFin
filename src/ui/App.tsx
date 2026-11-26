import { useEffect, useMemo, useRef, useState } from 'react';
import { collectPresets, type PresetFile } from '../core/presets';
import { changedKeys } from '../core/edit';
import { DATA_PATH, dataJson, parseData, type SideFinData } from '../core/sidefin';
import { printerFamilies } from '../core/table';
import type { Baseline, BaselineIndex, ProfileJson } from '../core/types';
import { isNewer, onlineVersion } from '../core/update';
import { allowRead, canPickFolder, readFileList, readFolder, rememberedFolder, rememberFolder, type FolderFile } from './folder';
import { backup, Changes } from './Changes';
import { Logo } from './Logo';
import { Viewer } from './Viewer';

const BASE = import.meta.env.BASE_URL;
const REPO = 'https://github.com/Arthur-de-Partuur/SideFin';
const HOUR = 60 * 60 * 1000;

const store = {
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
      /* storage blocked: the choice is just not remembered */
    }
  },
};

interface Loaded {
  folder: string;
  presets: PresetFile[];
  skipped: string[];
  /** The preset files as read, for the backup. */
  files: FolderFile[];
}

/** Changes not exported yet, per preset path; kept in the browser so a reload does not lose them. */
type Edits = Record<string, ProfileJson>;
const editsKey = (folder: string) => `edits.${folder}`;

export function App() {
  const [index, setIndex] = useState<BaselineIndex>();
  const [orca, setOrca] = useState<string | undefined>(store.get('orca'));
  const [baseline, setBaseline] = useState<Baseline>();
  const [error, setError] = useState<string>();
  const [newer, setNewer] = useState<string>();
  const [loaded, setLoaded] = useState<Loaded>();
  const [remembered, setRemembered] = useState<FileSystemDirectoryHandle>();
  const [printerName, setPrinterName] = useState<string | undefined>(store.get('printer'));
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [history, setHistory] = useState<{ edits: Edits; data: SideFinData }[]>([]);
  // SideFin's own file: as read from the folder, and as changed here.
  const [dataRead, setDataRead] = useState<{ data: SideFinData; exists: boolean; error?: string }>(() => ({ ...parseData(undefined), exists: false }));
  const [data, setData] = useState<SideFinData>(dataRead.data);

  const keepEdits = (next: Edits, folder = loaded?.folder) => {
    setEdits(next);
    if (folder) store.set(editsKey(folder), JSON.stringify(next));
  };
  const keepData = (next: SideFinData, folder = loaded?.folder) => {
    setData(next);
    if (folder) store.set(`data.${folder}`, dataJson(next));
  };

  useEffect(() => {
    fetch(`${BASE}baseline/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((i: BaselineIndex) => {
        setIndex(i);
        setOrca((o) => (o && i.versions.some((v) => v.orcaVersion === o) ? o : i.versions[0]?.orcaVersion));
      })
      .catch((e) => setError(`Could not load the list of Orca versions (${e.message}).`));
    rememberedFolder().then(setRemembered);
  }, []);

  useEffect(() => {
    const file = index?.versions.find((v) => v.orcaVersion === orca)?.file;
    if (!file || !orca) return;
    store.set('orca', orca);
    setBaseline(undefined);
    fetch(`${BASE}baseline/${file}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setBaseline)
      .catch((e) => setError(`Could not load the Orca ${orca} defaults (${e.message}).`));
  }, [index, orca]);

  useEffect(() => {
    const check = () =>
      onlineVersion(BASE).then((v) => {
        if (v && isNewer(v, __APP_VERSION__)) setNewer(v);
      });
    check();
    const t = setInterval(check, HOUR);
    return () => clearInterval(t);
  }, []);

  const load = (folder: string, files: FolderFile[]) => {
    const { presets, skipped } = collectPresets(files);
    const paths = new Set(presets.map((p) => p.path));
    setLoaded({ folder, presets, skipped, files: files.filter((f) => paths.has(f.path.replace(/\\/g, '/')) || f.path.replace(/\\/g, '/') === DATA_PATH) });
    let saved: Edits = {};
    try {
      saved = JSON.parse(store.get(editsKey(folder)) ?? '{}');
    } catch {
      saved = {};
    }
    // Keep only changes to presets that are still there.
    keepEdits(Object.fromEntries(Object.entries(saved).filter(([p]) => paths.has(p))), folder);
    const file = files.find((f) => f.path.replace(/\\/g, '/') === DATA_PATH);
    const read = { ...parseData(file?.text), exists: !!file };
    setDataRead(read);
    const kept = store.get(`data.${folder}`);
    setData(kept ? parseData(kept).data : read.data);
    setHistory([]);
  };

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await job();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(`Could not read the folder (${(e as Error).message}).`);
    } finally {
      setBusy(false);
    }
  };

  const pick = () =>
    run(async () => {
      if (!canPickFolder()) {
        fileInput.current?.click();
        return;
      }
      const dir = await window.showDirectoryPicker!({ id: 'orca-datadir', mode: 'read' });
      await rememberFolder(dir);
      setRemembered(dir);
      load(dir.name, await readFolder(dir));
    });

  const reopen = () =>
    run(async () => {
      if (!remembered || !(await allowRead(remembered))) return;
      load(remembered.name, await readFolder(remembered));
    });

  const presets = useMemo(() => loaded?.presets.map((p) => (edits[p.path] ? { ...p, json: edits[p.path] } : p)) ?? [], [loaded, edits]);
  const changed = useMemo(
    () => Object.fromEntries((loaded?.presets ?? []).filter((p) => edits[p.path]).map((p) => [p.path, changedKeys(p.json, edits[p.path])])),
    [loaded, edits],
  );
  const originals = useMemo(() => Object.fromEntries((loaded?.presets ?? []).map((p) => [p.path, p.json])), [loaded]);
  /** Apply changes to one or more presets as one step, so one Undo takes them all back. */
  const snapshot = () => setHistory([...history, { edits, data }]);
  const update = (changes: { file: PresetFile; json: ProfileJson }[], nextData?: SideFinData) => {
    snapshot();
    if (nextData) keepData(nextData);
    const next = { ...edits };
    for (const { file, json } of changes) {
      const original = loaded?.presets.find((p) => p.path === file.path)?.json;
      next[file.path] = json;
      if (original && changedKeys(original, json).length === 0) delete next[file.path];
    }
    keepEdits(next);
  };
  const updateData = (next: SideFinData) => {
    snapshot();
    keepData(next);
  };
  const undo = () => {
    if (!history.length) return;
    const last = history[history.length - 1];
    keepEdits(last.edits);
    keepData(last.data);
    setHistory(history.slice(0, -1));
  };
  const discard = () => {
    snapshot();
    keepEdits({});
    keepData(dataRead.data);
  };
  const dataChanged = dataJson(data) !== dataJson(dataRead.data);

  const printers = useMemo(() => (baseline && loaded ? printerFamilies(baseline, presets) : []), [baseline, loaded, presets]);
  const printer = printers.find((p) => p.name === printerName) ?? printers[0];

  return (
    <div className="page">
      {newer && (
        <div className="update" role="status">
          SideFin {newer} is online. <button onClick={() => location.reload()}>Reload to update</button>
        </div>
      )}
      <header className="top">
        <div className="brand">
          <Logo />
          <span>SideFin</span>
        </div>
        {loaded && printers.length === 1 && printer && (
          <span className="pick">
            Printer <b className="plain">{printer.name}</b> ({printer.printers.map((x) => x.nozzle ?? '?').join(', ')})
          </span>
        )}
        {loaded && printers.length > 1 && (
          <label className="pick">
            Printer{' '}
            <select
              value={printer?.name}
              onChange={(e) => {
                setPrinterName(e.target.value);
                store.set('printer', e.target.value);
              }}
            >
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} ({p.printers.map((x) => x.nozzle ?? '?').join(', ')})
                </option>
              ))}
            </select>
          </label>
        )}
        {index && (
          <label className="pick" title="The Orca version whose defaults SideFin compares with">
            Orca{' '}
            <select value={orca} onChange={(e) => setOrca(e.target.value)}>
              {index.versions.map((v) => (
                <option key={v.orcaVersion} value={v.orcaVersion}>
                  {v.orcaVersion}
                </option>
              ))}
            </select>
          </label>
        )}
        {loaded && (
          <button className="ghost" onClick={() => backup(loaded.files, loaded.folder)} title="Download all your presets, as they are in the folder, as a zip">
            Backup
          </button>
        )}
        {loaded && (
          <button className="ghost" onClick={pick} disabled={busy} title={`Reading: ${loaded.folder}`}>
            Folder: {loaded.folder}
          </button>
        )}
        <ThemeSwitch />
      </header>

      <input
        ref={fileInput}
        type="file"
        hidden
        // @ts-expect-error: webkitdirectory is not in React's types but works in every desktop browser
        webkitdirectory=""
        multiple
        onChange={(e) => {
          const list = e.target.files;
          if (list?.length) run(async () => load(list[0].webkitRelativePath.split('/')[0], await readFileList(list)));
        }}
      />

      {error && <p className="error">{error}</p>}

      {!loaded && (
        <section className="card start">
          <h1>See your Orca presets side by side</h1>
          <p>
            SideFin shows every setting of your printer, filament and process presets, per nozzle, next to the default of your printer maker,
            and marks where you differ.
          </p>
          <ol>
            <li>
              Choose your Orca data folder. In Orca: <b>Help → Show Configuration Folder</b> shows where it is.
            </li>
            <li>SideFin reads the presets in its <code>user</code> folder, here in your browser. Nothing is uploaded.</li>
          </ol>
          <div className="actions">
            <button className="primary" onClick={pick} disabled={busy}>
              Choose Orca data folder
            </button>
            {remembered && (
              <button onClick={reopen} disabled={busy}>
                Open "{remembered.name}" again
              </button>
            )}
            {busy && <span className="muted">Reading…</span>}
          </div>
        </section>
      )}

      {loaded && loaded.presets.length === 0 && (
        <section className="card">
          <p>
            No presets found in "{loaded.folder}". Choose the Orca data folder itself, the one that holds the <code>user</code> folder.
          </p>
        </section>
      )}

      {loaded && loaded.presets.length > 0 && !baseline && <p className="muted">Loading Orca {orca} defaults…</p>}
      {loaded && baseline && (
        <Changes
          baseline={baseline}
          originals={loaded.presets}
          current={edits}
          dataFile={dataChanged ? { path: DATA_PATH, text: dataJson(data), isNew: !dataRead.exists } : undefined}
          canUndo={history.length > 0}
          onUndo={undo}
          onDiscard={discard}
        />
      )}
      {loaded && baseline && loaded.presets.length > 0 && (
        <Viewer baseline={baseline} presets={presets} printers={printer} changed={changed} originals={originals} onUpdate={update} data={data} onData={updateData} />
      )}

      <footer>
        <span>SideFin {__APP_VERSION__}</span>
        {baseline && (
          <span title={`${baseline.report.settings} settings, read from OrcaSlicer ${baseline.source.tag}`}>
            Orca {baseline.orcaVersion} defaults
          </span>
        )}
        {loaded && <span>{loaded.presets.length} presets read</span>}
        <a href={`${REPO}/issues/new?template=bug.yml`}>Report a bug</a>
        <a href={`${REPO}/issues/new?template=idea.yml`}>Suggest an idea</a>
        <a href={`${REPO}/blob/main/CHANGELOG.md`}>What's new</a>
        <a href={`${REPO}/blob/main/LICENSE`}>AGPL-3.0</a>
      </footer>
    </div>
  );
}

type Theme = 'light' | 'system' | 'dark';

/** Light, Dark or follow the system; remembered in this browser. */
function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(() => {
    const t = store.get('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  });
  const choose = (t: Theme) => {
    setTheme(t);
    if (t === 'system') {
      delete document.documentElement.dataset.theme;
      store.set('theme', 'system');
    } else {
      document.documentElement.dataset.theme = t;
      store.set('theme', t);
    }
  };
  const options: [Theme, string, string][] = [
    ['light', 'Light', 'Always light'],
    ['system', 'System', 'Follow the Windows or browser setting'],
    ['dark', 'Dark', 'Always dark'],
  ];
  return (
    <div className="seg theme" role="group" aria-label="Colour theme">
      {options.map(([t, label, title]) => (
        <button key={t} className={theme === t ? 'on' : ''} aria-pressed={theme === t} title={title} onClick={() => choose(t)}>
          {label}
        </button>
      ))}
    </div>
  );
}
