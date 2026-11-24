# SideFin

See your OrcaSlicer printer, filament and process presets as Orca really uses
them, with the nozzle sizes side by side, and every setting that differs from
your printer maker's default (for example RatRig) marked.

**Live app:** https://arthur-de-partuur.github.io/SideFin/ (development version: [/SideFin/dev/](https://arthur-de-partuur.github.io/SideFin/dev/))

Your profiles stay on your computer. The app reads them in your browser and never uploads them.

## Status

Version 0.2 is the viewer: choose your Orca data folder and compare your
presets per nozzle with the printer maker's default. Version 0.3 (in progress
on the development version) adds changing values and exporting the presets. It works best in Chrome or Edge. See [docs/PURPOSE.md](docs/PURPOSE.md) for the goals and the release plan,
and [CHANGELOG.md](CHANGELOG.md) for what changed.

## For developers

See [docs/HOW-TO.md](docs/HOW-TO.md).

## Licence

AGPL-3.0, the same licence as OrcaSlicer, whose source SideFin reads to build its defaults. See [LICENSE](LICENSE).
