# Changelog

Goal ids refer to [docs/PURPOSE.md](docs/PURPOSE.md).

## 0.1.0 (in progress)

- Defaults builder: reads settings, built-in defaults, labels, levels, pages and groups, and the system profiles of the printer makers it reads (RatRig for now) and the Orca filament library from OrcaSlicer's source, per release. Built for Orca 2.4.2 and 2.5.2. (G1, G2)
- Core: works out the value in effect of every setting of a preset and where it comes from (the preset, a parent profile, or Orca's built-in default), and compares two presets. (G1, G2)
- Core: picks the values for the printer's extruder variant (such as "Direct Drive Standard"), as Orca does when slicing. Checked against a G-code file sliced in Orca 2.5.2: every difference left is explained. (G1)
- First page with the Orca versions SideFin knows, version footer, update message and bug and idea forms.
- Automatic tests, publishing to GitHub Pages, and a weekly check for new Orca releases.
