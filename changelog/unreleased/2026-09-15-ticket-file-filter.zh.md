# 公司看板忽略并非工单的 Markdown 文件

- **Date:** 2026-09-15
- **Type:** fix
- **Scope:** `server`
- **PR:** [#740](https://github.com/Prism-Shadow/penguin-harness/pull/740)

[English](2026-09-15-ticket-file-filter.md)

## 变更内容

- 公司模式发现工单时，现在只接受当前格式或旧格式的工单编号。因此 `README.md` 等文件即使
  放在工单列目录中，也不会作为格式错误的工单出现在看板上。
- 新增回归测试，覆盖当前格式、旧格式和无关的 Markdown 文件名。

Issue: https://github.com/Prism-Shadow/penguin-harness/issues/735
