# Changelog

Goal ids refer to [docs/PURPOSE.md](docs/PURPOSE.md).

## 0.2.0 (in progress)

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
