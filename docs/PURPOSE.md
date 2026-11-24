# SideFin: purpose

SideFin shows OrcaSlicer printer, filament and process presets as Orca really
uses them, with the nozzle sizes side by side, and marks every setting that
differs from the printer maker's default. It works for any printer Orca has
system profiles for; RatRig is the first one it reads.

## Root cause

**R1** Orca shows one preset at a time, and only the part you changed. A user
preset stores only its own values. What you actually print with is spread over
three or four files plus Orca's built-in defaults, and Orca has no screen to
compare two presets.

## Problems

- **P1** No full picture: you cannot see all settings of a preset in one place, with where each value comes from.
- **P2** Deviations are invisible: a deliberate choice and a leftover look the same.
- **P3** Nozzle sets drift apart: the 0.25, 0.40 and 0.60 versions of a preset should differ only where the nozzle requires it.
- **P4** Editing JSON by hand is risky: a typo or a wrong value type is silently ignored or misread by Orca.
- **P5** Orca updates change the defaults, so your values may deviate where they did not before.
- **P6** Calibration results are scattered as free text, without test settings, nozzle or hardware.

## Goals

- **G1** Every setting of every preset is visible with its value in effect and its source (yours, printer maker, Orca library, Orca built-in). (P1)
- **G2** Every deviation from the printer maker's default is marked, with the default next to it. (P2)
- **G3** The same preset can be compared across nozzle sizes in one view. (P3)
- **G4** A setting can be changed in the app and exported as a valid Orca file. (P4)
- **G5** After an Orca update the app shows which defaults changed and which presets that touches. (P5)
- **G6** Your profiles stay on your computer; the app never uploads them. (condition for all)
- **G7** Every filament and nozzle has a calibration log: test, settings, hardware, result, date. (P6)
- **G8** A logged result can be put into the preset in one step, through the normal export. (P4, P6)

## What it is not

1. Not a slicer, and not a replacement for Orca's own settings screens.
2. Not a sync or cloud backup of your Orca data folder.
3. Not a library of other people's profiles. Profiles are never stored in this repository.
4. Not a tool that "fixes" values. It shows and reports; you decide.

## Releases

| Step | Version | What | Goals |
|---|---|---|---|
| 1 | 0.1 | Foundation: defaults builder, core resolver, tests, website | G1, G2 |
| 2 | 0.2 | Viewer: three tabs, nozzle columns, printer maker's default, source, levels, search | G1, G2, G3, G6 |
| 3 | 0.3 | Edit and export, value checks, backup, undo, CSV | G4 |
| 4 | 0.4 | Manufacturer advice, calibration placeholders | G7 |
| 5 | 0.5 | Orca update changes | G5 |
| 6 | 0.6 | Calibration working | G7, G8 |
| 7 | 1.0 | Save directly into the Orca data folder, with backup | G4 |

## Parked ideas (no goal yet)

1. Open an Orca project (.3mf) and show which settings it overrides on top of the saved presets. Found on 24 Nov 2026: a project changed 7 process settings (walls, brim, supports, first layer speeds) that the presets do not show.
