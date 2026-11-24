import { useEffect, useMemo, useRef, useState } from 'react';
import { collectPresets, type PresetFile } from '../core/presets';
import { printerFamilies } from '../core/table';
import type { Baseline, BaselineIndex } from '../core/types';
import { isNewer, onlineVersion } from '../core/update';
import { allowRead, canPickFolder, readFileList, readFolder, rememberedFolder, rememberFolder, type FolderFile } from './folder';
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
}

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
    setLoaded({ folder, presets, skipped });
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

  const printers = useMemo(() => (baseline && loaded ? printerFamilies(baseline, loaded.presets) : []), [baseline, loaded]);
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
          <button className="ghost" onClick={pick} disabled={busy} title={`Reading: ${loaded.folder}`}>
            Folder: {loaded.folder}
          </button>
        )}
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
      {loaded && baseline && loaded.presets.length > 0 && <Viewer baseline={baseline} presets={loaded.presets} printers={printer} />}

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
