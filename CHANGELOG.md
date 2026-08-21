# Changelog

All notable changes to this project are documented here.

## [0.1.0] - Unreleased

### Added

- M0.1 established the clean product workspace, persistent progress ledger, and local secret/index ignore policy.
- M0.2 added a tested `SessionStart` continuity guard for startup, resume, clear, and compact events.
- M0.3 added a minimal project-local implementation agent pinned to exact `gpt-5.3-codex-spark` with no fallback.

### Changed

- M0.1 moved the two legacy repositories and their existing aggregate indexes into a separate research workspace without deleting them.
- M0.2 made `AGENTS.md` the canonical per-task bootstrap and evidence contract while relying on the existing global Graphify hook instead of duplicating it locally.
- M0.3 configured Serena for the clean project name and the TypeScript language server; runtime activation remains a post-restart gate.
- M0.3 removed the accidental trailing space from the product root and added a committed, clipboard-ready M0.4 restart handoff.
- M0.3a accepted Serena 1.7.0's canonical project configuration after fresh activation filled omitted defaults, and repaired the restart handoff to require one clean no-rewrite reload before M0.4.
- M0.3b raised the exact Spark implementation agent from `medium` to user-selected `xhigh`; runtime acceptance is deferred to a fresh-process canary with no fallback.
- M0.4 completed the control-plane bootstrap after signed clean-root, stable Serena TypeScript, preserved SessionStart, and exact Spark+xhigh runtime canaries passed read-only component and integrated adversarial audits.
