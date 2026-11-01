# Changelog

## [1.1.0] - 2026-11-01

### Added

- Support for `#elifdef`, `#elifndef`, and an optional space after `#` in preprocessor lines.
- Preprocessor syntax highlighting injected into C and C++ grammars instead of registering a separate language.
- Parsing and folding for `#if`, `#elif`, `#elseif`, and related branch directives alongside `#ifdef` / `#ifndef`.
- Cached per-document analysis so nested paths and decorations are not rebuilt on every cursor move.

### Changed

- Decorations and status-bar path update when the file is edited, not only when the selection changes.
- Condition text in the path omits nested `defined(...)` wrappers for clearer labels.
- Section detection rewritten to follow nesting and `#else` / `#elif` branches correctly.
- Folding command “Collapse All Under This Section” uses the innermost block that contains the cursor, including when the cursor is on a branch line.
- Minimum supported VS Code version is 1.74.
- Extension bundle built with esbuild; trace logging is omitted from the published build.
- Diagnostics log to a VS Code output channel.

### Fixed

- `#ifndef`, `#elifndef`, and `#else` branches show the correct negated path.
- Conditions containing `!` parse correctly.
- Block and line comments inside preprocessor expressions no longer break parsing.
- Improved matching of preprocessor directive lines.
- Built-in C/C++ folding is no longer disabled on activation.
- Selection change listener is registered as a disposable and cleaned up with the extension.

## [1.0.0] - 2024-07-16

### Added

- Initial release of the extension.
- Highlighting for `#ifdef`, `#else`, and `#endif` directives.
- Cursor-based path decoration for nested `#ifdef` blocks.
- Region folding commands for `#ifdef` sections.