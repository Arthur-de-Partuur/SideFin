import { useEffect, useState } from 'react';
import type { Baseline, BaselineIndex } from '../core/types';
import { isNewer, onlineVersion } from '../core/update';
import { Logo } from './Logo';

const BASE = import.meta.env.BASE_URL;
const REPO = 'https://github.com/Arthur-de-Partuur/SideFin';
const HOUR = 60 * 60 * 1000;

export function App() {
  const [index, setIndex] = useState<BaselineIndex>();
  const [version, setVersion] = useState<string>();
  const [baseline, setBaseline] = useState<Baseline>();
  const [error, setError] = useState<string>();
  const [newer, setNewer] = useState<string>();

  useEffect(() => {
    fetch(`${BASE}baseline/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((i: BaselineIndex) => {
        setIndex(i);
        setVersion(i.versions[0]?.orcaVersion);
      })
      .catch((e) => setError(`Could not load the list of Orca versions (${e.message}).`));
  }, []);

  useEffect(() => {
    const file = index?.versions.find((v) => v.orcaVersion === version)?.file;
    if (!file) return;
    setBaseline(undefined);
    fetch(`${BASE}baseline/${file}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setBaseline)
      .catch((e) => setError(`Could not load the Orca ${version} defaults (${e.message}).`));
  }, [index, version]);

  useEffect(() => {
    const check = () =>
      onlineVersion(BASE).then((v) => {
        if (v && isNewer(v, __APP_VERSION__)) setNewer(v);
      });
    check();
    const t = setInterval(check, HOUR);
    return () => clearInterval(t);
  }, []);

  const count = (o: object) => Object.keys(o).length.toLocaleString('en');

  return (
    <div className="page">
      {newer && (
        <div className="update" role="status">
          SideFin {newer} is online. <button onClick={() => location.reload()}>Reload to update</button>
        </div>
      )}
      <header>
        <Logo />
        <h1>SideFin</h1>
        <span className="tag">See your OrcaSlicer profiles next to the RatRig defaults, per nozzle.</span>
      </header>

      <main>
        <section className="card">
          <h2>Foundation is in place</h2>
          <p>
            This first version only checks that SideFin can read Orca's own defaults. The viewer with your printer,
            filament and process presets side by side comes in version 0.2.
          </p>
        </section>

        <section className="card">
          <h2>Orca defaults SideFin knows</h2>
          {error && <p className="error">{error}</p>}
          {index && (
            <label className="pick">
              Orca version{' '}
              <select value={version} onChange={(e) => setVersion(e.target.value)}>
                {index.versions.map((v) => (
                  <option key={v.orcaVersion} value={v.orcaVersion}>
                    {v.orcaVersion}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!baseline && !error && <p className="muted">Loading…</p>}
          {baseline && (
            <ol className="facts">
              <li>{baseline.report.settings.toLocaleString('en')} settings, {baseline.report.withDefault.toLocaleString('en')} with a built-in default.</li>
              <li>{baseline.report.shownInOrca.toLocaleString('en')} of them are shown in Orca's settings tabs, with their page and group.</li>
              <li>
                Stored per preset: printer {baseline.presetKeys.printer.length}, filament {baseline.presetKeys.filament.length}, process{' '}
                {baseline.presetKeys.process.length}.
              </li>
              <li>
                System profiles: {count(baseline.profiles.printer)} printer, {count(baseline.profiles.filament)} filament,{' '}
                {count(baseline.profiles.process)} process (RatRig and the Orca filament library).
              </li>
              {baseline.report.unparsedDefaults.length > 0 && (
                <li>Defaults SideFin could not read yet: {baseline.report.unparsedDefaults.join(', ')}.</li>
              )}
              <li className="muted">
                Read from <a href={`${baseline.source.repository}/tree/${baseline.source.tag}`}>OrcaSlicer {baseline.source.tag}</a> on{' '}
                {new Date(baseline.generatedAt).toLocaleDateString('en-GB')}.
              </li>
            </ol>
          )}
        </section>
      </main>

      <footer>
        <span>SideFin {__APP_VERSION__}</span>
        <a href={`${REPO}/issues/new?template=bug.yml`}>Report a bug</a>
        <a href={`${REPO}/issues/new?template=idea.yml`}>Suggest an idea</a>
        <a href={`${REPO}/blob/main/CHANGELOG.md`}>What's new</a>
        <a href={`${REPO}/blob/main/LICENSE`}>AGPL-3.0</a>
      </footer>
    </div>
  );
}
