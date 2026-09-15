# Company boards ignore non-ticket Markdown files

- **Date:** 2026-09-15
- **Type:** fix
- **Scope:** `server`

[中文版](2026-09-15-ticket-file-filter.zh.md)

## What changed

- Company-mode ticket discovery now accepts only current or legacy ticket identifiers. Files such
  as `README.md` can live in a ticket column without appearing as malformed tickets on the board.
- Added a regression test covering current, legacy, and unrelated Markdown filenames.

Issue: https://github.com/Prism-Shadow/penguin-harness/issues/735
