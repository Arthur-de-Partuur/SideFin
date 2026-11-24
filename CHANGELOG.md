# Changelog

Goal ids refer to [docs/PURPOSE.md](docs/PURPOSE.md).

## 0.4.0-dev.1 (2026-11-24)

- SideFin keeps its own file in your Orca data folder: `sidefin/sidefin.json`, next to `user`. It holds what Orca has no place for: the filament maker's advice, the calibration log and the printer's hardware now. Orca's cache cleanup leaves it alone. It is exported with the presets. (G7, decision S1)
- Filament tab: a "Manufacturer" line above the table and a "Manufacturer" column with the maker's advised values (temperatures, fan, max volumetric speed, density), the product name, a link to the data sheet and other advice such as drying. Click to add or change it. "Find the data sheet" opens a web search. (G2, G7, decision S2)
- Calibration panel per filament: pressure advance and max volumetric speed for each nozzle, with the value in the preset now and the date of the last test from the log. Tests done on other hardware are marked. Running and logging tests comes in 0.6. (G7, decision S3)
- "Due for calibration" in the side bar: filaments and nozzles with no test yet, or a test on other hardware. Click one to open it. (G7)
- Undo and Discard also cover the advice, log and hardware.

## 0.3.0 (2026-11-24)

- Click a value of your preset to change it: a number field, yes/no, a list of choices or a text box for G-code. Each change can be undone, and "Back to inherited" removes the preset's own value. (G4)
- A value of the wrong type or outside Orca's own limits is refused, with the reason. (G4)
- Settings with one value per extruder type (Orca 2.4 and later) change only for the printer's extruder type. (G4)
- Changes are kept in the browser until you export them, also after a reload. Changed values are marked. (G4)
- Export: the changed presets as Orca JSON files, one file or a zip with the folders. Settings your Orca version no longer knows can be removed on export, also from unchanged presets. (G4)
- Backup: download all your presets, exactly as read, as a zip. (G6)
- Download the table as CSV. (G1)
- For a changed value, the edit box shows what your file holds, with "Back to my value". (G4, remark E1)
- Warnings for values that look odd (G4, feedback point 7). A red "!" for a likely mistake: a line width under 60% or over 200% of the nozzle, or a nozzle temperature outside the filament's range. A small grey circle for a number more than 50% from the printer maker's default (0 and negative values left out). Click a value to mark a row as deliberate; its marks stay hidden until the value changes (0.3.0-dev.4). Filter "Only notes and warnings"; the editor warns while you type.
- Filament tab "By type": all filaments of one type (PLA, PETG, ...) side by side for one nozzle, with "Also set this for the other filaments shown" in the editor. One Undo takes such a change back. (G3, G4, feedback point 9)

## 0.2.0 (2026-11-24)

Feedback round 1 (0.2.0-dev.2):

- The viewer uses the whole window; the table scrolls inside it and the footer stays visible. (points 1, 2)
- Choose which nozzles to show (0.25, 0.40, 0.60); the choice is remembered. (point 3, G3)
- Number columns stay narrow; G-code and notes are shown in full, wrapped, up to 8 lines, with "Show all". (point 4)
- The default column is named after its source ("RatRig default", "Orca library default"); Orca's built-in values are grey italic. (point 6)
- An (i) next to each setting shows Orca's explanation; settings such as "Fan speed-up time" now have their name. (point 5)
- With one printer, its name is shown as text instead of a one-item list.
- "Show all" only appears when a text is cut off. (0.2.0-dev.3, point 4)

- Viewer: choose your Orca data folder and see your printer, filament and process presets side by side per nozzle, next to the printer maker's default. Nothing is uploaded; Chrome and Edge remember the folder. (G1, G2, G3, G6)
- Values that differ from the default are marked, as are settings where the nozzles differ. Bold values are set in the preset itself; hover a value to see where it comes from. (G1, G2, G3)
- Simple, Advanced and All levels as in Orca, filters "only where I differ" and "only where nozzles differ", and search by name or key. (G1)
- Only presets that fit the chosen printer are listed, following their compatible printers condition. (G1)
- Old values Orca converts, such as arc fitting "0", are marked "old". (G1)
- Defaults builder: Orca's page order for the Filament tab, and lists that Orca fills from one value (["100"] equals ["100", "100"]) count as equal.

## 0.1.0

- Defaults builder: reads settings, built-in defaults, labels, levels, pages and groups, and the system profiles of the printer makers it reads (RatRig for now) and the Orca filament library from OrcaSlicer's source, per release. Built for Orca 2.4.2 and 2.5.2. (G1, G2)
- Core: works out the value in effect of every setting of a preset and where it comes from (the preset, a parent profile, or Orca's built-in default), and compares two presets. (G1, G2)
- Core: picks the values for the printer's extruder variant (such as "Direct Drive Standard"), as Orca does when slicing. Checked against a G-code file sliced in Orca 2.5.2: every difference left is explained. (G1)
- First page with the Orca versions SideFin knows, version footer, update message and bug and idea forms.
- Automatic tests, publishing to GitHub Pages, and a weekly check for new Orca releases.
