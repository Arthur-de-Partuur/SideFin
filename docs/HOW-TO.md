# How SideFin is built and maintained

## Parts

1. **The app** (`src/`): a React web page built with Vite. It runs in the
   browser and reads your Orca data folder on your own computer (G6).
   - `src/core/`: logic without any screen code. Every rule here has a test next to it (`*.test.ts`).
     - `resolve.ts`: the value in effect of each setting and where it comes from.
     - `presets.ts`: finds presets in the chosen folder and groups them per nozzle.
     - `table.ts`: the rows and columns the viewer shows.
     - `edit.ts`: checking a typed value as Orca would, changing a preset, and writing it as Orca does (keys sorted, four spaces).
     - `export.ts`: the zip and CSV files the app hands you.
     - `sidefin.ts`: SideFin's own file `<data folder>/sidefin/sidefin.json` (maker's advice, calibration log, hardware) and which tests are due.
     - `orcaUpdate.ts`: what an Orca update changes for your presets: changed inherited values, own values that are an old default, new and obsolete settings.
     - `calibrate.ts`: the calibration methods (Orca, Ellis, hotend flow tester) and the values to type into each, worked out from the presets. For the hotend flow tester it also turns the printer's start and end G-code into the tool's `${variable}` form (`flowTesterGcode`).
   - `src/ui/`: the screens.
2. **The defaults builder** (`scripts/baseline/`): reads OrcaSlicer's source for
   one release and writes `public/baseline/<version>.json`. That file holds:
   - every setting with its label, tooltip, unit, level (Simple/Advanced), limits and built-in default (`PrintConfig.cpp`),
   - where Orca shows it: tab, page and group (`Tab.cpp`),
   - which settings each kind of preset stores (`Preset.cpp`),
   - the system profiles of the printer makers listed in `VENDORS` in `build.ts` (RatRig for now) and the Orca filament library (`resources/profiles`). Adding a printer maker is one line there.

## Everyday commands

```sh
npm install          # once
npm run dev          # open the app at http://localhost:5173/SideFin/
npm test             # run all tests
npm run build        # type check and build into dist/
npm run baseline -- v2.5.2     # build the defaults for one Orca release
npm run baseline -- --latest   # build the newest Orca release if it is missing
```

## Branches and versions

1. `dev` is where work happens. Every push to `dev` is published at `/SideFin/dev/`.
2. `main` is the live app at `/SideFin/`. Changes reach `main` through a pull request from `dev`.
3. Versions follow `MAJOR.MINOR.PATCH`; work in progress is `-dev.N`. Bump `package.json` and add a line to `CHANGELOG.md` with the goal ids.
4. An open page checks `version.json` every hour and offers a reload when a newer version is online.

## Automatic jobs (`.github/workflows`)

1. `ci.yml`: tests and build on every push and pull request.
2. `pages.yml`: publishes `main` and `dev` to GitHub Pages.
3. `baseline.yml`: every Monday, builds the defaults for a new Orca release if there is one, and opens a pull request with it.

## Rules

1. Never commit anyone's own profiles or `sidefin.json`. Tests use made-up fixtures in `src/core/fixtures/`.
2. SideFin shows and reports; it never changes a value on its own.
3. When the builder cannot read something from Orca's source, it lists it in the report instead of guessing.
