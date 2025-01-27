# Changelog of tolk-vscode

Historically, tolk-vscode has been cloned from [vscode-func](https://github.com/tonwhales/vscode-func)
and completely refactored.

## [0.8.0] - 2025-01-27

* Support Tolk v0.8 (syntax `tensorVar.0` / `tupleVar.0`)
* Fix a bug that variables in `catch` were considered unknown symbols

## [0.7.0] - 2025-01-13

* Support Tolk v0.7 (`bool` type, `as` operator, generics instantiations `f<int>`)
* Rewritten tree-sitter grammar to a modern way

## [0.6.0] - 2024-11-01

* First public release, supporting all Tolk v0.6 grammar and Tolk SDK auto-detection.
* Syntax highlighting, auto-completion, go to definition, info on hover, code formatting, rename locals, diagnostics of undefined symbols.
* Versioning of VS Code extension isn't supposed to match versions of the Tolk Language, but v0.6 is the starting point for both.
