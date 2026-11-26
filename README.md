# SideFin

See your OrcaSlicer printer, filament and process presets as Orca really uses
them, with the nozzle sizes side by side, and every setting that differs from
your printer maker's default (for example RatRig) marked.

**Live app:** https://arthur-de-partuur.github.io/SideFin/ (development version: [/SideFin/dev/](https://arthur-de-partuur.github.io/SideFin/dev/))

Your profiles stay on your computer. The app reads them in your browser and never uploads them.

## Status

Version 0.2 is the viewer: choose your Orca data folder and compare your
presets per nozzle with the printer maker's default. Version 0.3 adds changing
values (with checks and warnings) and exporting the presets as Orca files. Version 0.4 adds the filament maker's advice, a calibration log, and guided calibration (Orca, Ellis and the hotend flow tester) whose result goes into the preset. Version 0.4 adds the filament maker's advice, a calibration overview per filament and nozzle, and calibration (pressure advance, extrusion multiplier, max flow) with setup values for Orca's tests and outside tools, a log, and the result put into the preset, kept in `sidefin/sidefin.json` in your Orca data folder. It works best in Chrome or Edge. See [docs/PURPOSE.md](docs/PURPOSE.md) for the goals and the release plan,
and [CHANGELOG.md](CHANGELOG.md) for what changed.

## For developers

See [docs/HOW-TO.md](docs/HOW-TO.md).

## Licence

AGPL-3.0, the same licence as OrcaSlicer, whose source SideFin reads to build its defaults. See [LICENSE](LICENSE).
