# Changelog

Goal ids refer to [docs/PURPOSE.md](docs/PURPOSE.md).

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
