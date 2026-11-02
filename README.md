# IFDEF Pathfinder
Chart your path through the labyrinth of #ifdef directives with the ultimate explorer tool!

## Description

Embark on a stellar journey with IFDEF Pathfinder, an extension so advanced it could run a starship. Never lose your way in the labyrinth of nested #ifdef statements again. Chart your course through conditional compilation with the finesse of a starship captain navigating the stars.

Say goodbye to the dark ages of manual #ifdef tracking. With IFDEF Pathfinder, you'll have a trusty co-pilot illuminating your path with vibrant colors, guiding you through the most complex #ifdef terrains. Whether you're a novice space cadet or a seasoned code explorer, this extension ensures your voyage through the cosmos of conditional logic is smoother than ever.

In a universe where coding can feel like navigating an asteroid field, IFDEF Pathfinder is your reliable star map, your trusty tricorder, your beacon in the vast expanse of preprocessor directives. Ready to join the ranks of elite code explorers?
With IFDEF Pathfinder, you'll boldly go where no coder has gone before!

### Colorize & Dynamic ifdef path
![Colorize & Dynamic ifdef path](https://raw.githubusercontent.com/tanffn/IFDEF-Pathfinder/main/Marketing/Path.png)

### ifdef folding
![ifdef folding](https://raw.githubusercontent.com/tanffn/IFDEF-Pathfinder/main/Marketing/Folding.png)

## Features

- Supports all `#ifdef`, `#if`, `#elif`, and other preprocessor variants.
- Region folding: Add new VSCode commands to collapse/expand `#ifdef` sections (accessible via F1).
- Colorized and highlighted `#ifdef` sections with relevant logic indicators.
- Dynamic path decoration for nested `#ifdef` blocks displayed in the status bar.

## Installation

1. Open the Extensions view by clicking the Extensions icon in the Activity Bar on the side of the window or by pressing `Ctrl+Shift+X`.
2. Search for `IFDEF Pathfinder`.
3. Click the `Install` button.

## Usage

- Press `Ctrl+Shift+P` or `F1` in a C or C++ file to access the folding commands:
  - `IFDEF Pathfinder: Collapse All in Page`
  - `IFDEF Pathfinder: Collapse All Under This Section`
  - `IFDEF Pathfinder: Expand All`
- The status bar shows the conditions in effect at the cursor.
- `#elif`, `#else` and `#endif` lines show their condition at the end of the line.

## Configuration

Settings are under `ifdefPathfinder` in the Settings editor:

| Setting                              | Default                       | Description                                                                   |
| ------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------- |
| `languages`                          | C, C++, CUDA, Objective-C/C++ | Language identifiers of the files that the extension works in.                |
| `inlineHints.directives`             | `["elif", "else", "endif"]`   | Directives that show their condition at the end of the line.                  |
| `inlineHints.hideWhenEndifCommented` | `true`                        | Leaves out the hint on an `#endif` whose comment already names the condition. |
| `statusBar.enabled`                  | `true`                        | Shows the conditions in effect at the cursor in the status bar.               |

Hint colors follow the theme's bracket pair colors. To change them, set `ifdefPathfinder.depth1Foreground` to `ifdefPathfinder.depth6Foreground` in `workbench.colorCustomizations`:

```json
"workbench.colorCustomizations": {
    "ifdefPathfinder.depth1Foreground": "#569cd6"
}
```

## Changelog

See the [CHANGELOG.md](./CHANGELOG.md) for details about the latest updates.

## Contributing

Contributions are welcome! Please submit issues or pull requests via [GitHub](https://github.com/tanffn/IFDEF-Pathfinder).

## License

This extension is licensed under the MIT License. See the [LICENSE](./LICENSE) file for more information.
