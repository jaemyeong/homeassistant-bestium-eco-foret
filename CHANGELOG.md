# Changelog

All notable changes to this project are documented here.

## [0.1.3] - 2026-08-22

### Fixed

- Detect a connected TCP transport that receives no data for the configured
  `idle_timeout_ms`. A true idle transport is replaced inside the same bounded
  capture without resetting sequence, counters, store, or duration; a transport
  paused for an unresolved append is retained and re-armed until buffered data
  can drain.
- Add the `BESTIUM Capture` Ingress panel title alongside the existing
  radio-tower icon. Home Assistant's **Show in sidebar** choice remains a
  per-user UI preference and is not forced by the App manifest.

### Changed

- Bumped both package manifests, the App config, and Docker label to `0.1.3`.
- Added a validated 30,000 ms receive-idle default with an accepted range of
  5,000–3,600,000 ms and exposed the active bound in the Ingress dashboard.

### Verification

- The stopped `0.1.2` download contained 143,265 valid, gap-free NDJSON records
  and 2,856,364 captured bytes. Its last record arrived about 3 hours 12 minutes
  before manual Stop while none of the 24-hour, 64 MiB, or 1,000,000-record
  ceilings had been reached. This confirms the App's missing silent-idle
  handling; it does not identify whether the external trigger was the EW11 or
  the network.
- Exact Luna/max RED isolated idle replacement, preserved counters/sequence and
  duration, strict settings/config, status, and dashboard presentation. GREEN
  passes the full native suite at 33/33 and the focused suite at 5/5; parent JSON,
  version, diff, Graphify, CodeGraph, and Serena checks also pass with only the
  historical absent Node ambient declarations.
- The first exact Sol/max audit found one P1: a timeout during an in-flight store
  append could connect an unpaused replacement and drop its first buffered data.
  It also found one handoff P3 because a clean-session `git diff --check` would be
  vacuous. Exact Luna/max repair round 1 reproduced the P1 with one focused RED,
  then pauses the replacement until the prior append settles and resumes the
  current transport. Parent passes both idle tests 2/2 and the full suite 34/34;
  the handoff now checks the actual `HEAD^..HEAD` commit range.
- Fresh exact Sol/max re-audit returned FAIL with a repeated P1 in the same
  reconnect/backpressure integrity area: timeout can destroy the intentionally
  paused old socket while it still holds unread bytes, discarding them before
  append settlement resumes the stream.
- The user explicitly approved one narrow repair-round-2 exception. Exact
  Luna/max added an old-current-transport buffered-data RED, which parent
  reproduced at 0/1. GREEN retains and re-arms the paused current transport
  while `pendingAppend` exists; append success resumes it and drains buffered
  data in sequence. The obsolete round-1 replacement-during-pending test was
  deleted because its expectation contradicted this lossless contract. Parent
  passes the two valid idle tests 2/2 and full native suite 34/34.
- The first repair-round-2 Sol/max audit found no product P0-P2 and its bounded
  canaries accepted repeated timeout, ordered buffered drain, later true-idle
  replacement, terminal paths, and cleanup. It returned FAIL only for one P3:
  the native regression did not directly assert timeout re-arming. Exact
  Luna/max therefore changed only the existing fake-transport test to assert
  the initial arm and one additional arm after each of two pending-append
  timeouts. Parent again passes idle 2/2 and full 34/34. Fresh exact Sol/max
  re-audit killed the no-re-arm mutant, rechecked the bounded lifecycle paths,
  and returned PASS with no actionable P0-P3.
- Current official Node 24 and Context7 evidence confirms that socket inactivity
  emits `timeout` without closing the socket. The App therefore explicitly
  replaces a true-idle transport, while deferring that replacement during active
  append backpressure. Current official Home Assistant and Context7 evidence
  confirms panel title/icon support and the separate per-user **Show in sidebar**
  preference. Sosumi: N/A because this work contains no Apple API, HIG, or Swift
  claim.
- Signed product commit `19582189ed5fa5ff9cedc42e9d63b4e6e05a0a8a`
  is published on public `main`; GitHub's commit API and public App config were
  independently checked and expose version `0.1.3`. Home Assistant refresh,
  update/start, sidebar-toggle verification, and any new live capture remain
  unperformed and require separate authorization.

## [0.1.2] - 2026-08-22

### Added

- Added a dependency-free responsive Ingress dashboard with accessible inline SVG symbols, bounded status/preview cards, Start/Stop controls, and finalized-capture Download.
- Added persistent NDJSON capture storage under the Home Assistant App `/data` boundary, safe early-stop finalization, restart recovery, and summary-only App lifecycle logs without raw-payload logging.
- Added a public installation/configuration/safety README with a privacy-cropped live Ingress screenshot.
- Replaced the stale M2 restart prompt with an M3.2 handoff that resumes only finalized-result and Download verification without starting another capture.

### Changed

- Expanded the validated capture ceiling to 24 hours, 64 MiB, and 1,000,000 records while preserving the safe 5-second, 64 KiB, and 1,000-record defaults.
- Bumped the repository, App, config, and Docker label release surfaces to `0.1.2`; added the current `mdi:radio-tower` panel icon and explicit Docker-context allowlists for the two new source files.

### Verification

- Tests-first RED was independently reproduced at 4/17 passing with 13 intended failures; initial GREEN passed targeted 17/17 and full 19/19 plus JSON, diff, Graphify, CodeGraph, and Serena readiness checks.
- The first exact Sol/max read-only audit found no P0 but identified long-capture P1/P2 defects. Exact Luna/max repair round 1 passed targeted 23/23 and full 25/25 plus static/index/LSP checks, but re-audit found asynchronous store-open safety, mixed partial/final ordering, production response-adapter, and UI phase gaps.
- Final exact Luna/max repair round 2 first reproduced a narrow 23/27 RED and then passed targeted 27/27 and full 29/29 plus diff, Graphify, CodeGraph, and Serena readiness checks.
- Final Sol/max re-audit nevertheless reproduced a repeated P1: a microtask fallback lets capture-store `begin()` resolve before a real asynchronous file-open error, while the regression test masks that ordering. The two-round stop rule is active; no `0.1.2` commit, push, Home Assistant update, or capture occurred.
- The user explicitly authorized one exceptional third product repair limited to that writer-open P1 and masking test; fresh RED/GREEN and Sol/max PASS remain required before publication or live capture.
- Exceptional exact Luna/max RED changed only the delayed-open test; parent reproduced 26/27 PASS with the sole intended failure proving `begin()` settles before a later writer event. Product and configuration files remained byte-identical to the pre-RED baseline.
- Exceptional exact Luna/max GREEN removed only the unconditional writer-ready microtask fallback and corrected the healthy retry fixture ordering. Parent passed targeted 27/27, full 29/29, JSON/diff, refreshed Graphify/CodeGraph, and exact-root Serena checks; fresh Sol/max acceptance remains pending.
- Fresh exact Sol/max audit closed writer-open readiness but returned FAIL: finish-based finalization can report success and rename before a later `flush:true` fsync/close error, and the production response-adapter spread freezes live `writableEnded`. No commit, push, installed-App update, or capture occurred.
- The user explicitly authorized both additional findings for a bounded test-first exact Luna/max repair and fresh Sol/max re-audit; every external-action boundary remains unchanged until that audit passes.
- Exact Luna/max additional RED changed only the native test file; parent reproduced 27/30 PASS with exactly three intended failures covering close-before-rename, late flush-error rejection, and direct production response-adapter handoff. Product/config hashes and empty staging were preserved.
- Additional GREEN waits through writer close/error before rename and hands the live production response adapter directly. Parent passed targeted 30/30, full 32/32, JSON/diff, refreshed Graphify/CodeGraph, and exact-root Serena checks; fresh Sol/max acceptance remains pending.
- Fresh exact Sol/max final audit returned PASS with no actionable P0-P3 or repeated P0/P1; actual custom-fs canaries confirmed failure prevents rename and healthy finalization orders fsync, close, then rename. Signed publication and the authorized live App gate remain pending.
- Signed product commit `791fe4e597bfd7a1f294bc54fa519a59b9b4a1cc` verified Good and matched public `main`; Home Assistant installed/current App `0.1.2` then started successfully and rendered the admin Ingress dashboard.
- The sole authorized bounded RX-only capture started with the saved 24-hour, 64 MiB, and 1,000,000-record ceilings. It remained `Running` after 21,462 ms with 2,339 bytes and 117 records; finalization and Download verification await the user's early Stop or a configured terminal bound.
- Playwright captured the same running Ingress at 515,467 ms, 55,206 bytes, and 2,760 records. The public crop excludes the private endpoint, account identity, and raw packet preview; no Stop, Download, second capture, or protocol interpretation occurred.
- Current official Home Assistant docs and Context7 reconfirmed the README's third-party repository, App layout, manual-only/experimental, options/schema, and admin-only Ingress claims. Sosumi: N/A because this documentation unit has no Apple claim.
- The first exact Sol/max documentation audit found a push-count P1, newly repeated private-endpoint P2, and incomplete host-validation P3. Documentation repair round 1 distinguishes the completed product and authorized handoff pushes, removes the two new endpoint repetitions, and documents the full host-shape rejection; fresh exact Sol/max re-audit passed with no actionable P0-P3.

## [0.1.1] - 2026-08-21

### Fixed

- Removed the App Dockerfile's `USER node` override so the runtime can read Home Assistant's Supervisor-mounted `/data/options.json`; synchronized the App config, Docker label, and both package manifests at `0.1.1`.

### Verified

- Home Assistant Supervisor updated and started App `0.1.1`; one admin Ingress `GET /` returned `current:stopped` and `last:null` while the App remained running.
- No Capture/Stop POST, production TCP/EW11 access, device change, local Docker command, or package installation was performed.

## [0.1.0] - 2026-08-21

### Added

- M0.1 established the clean product workspace, persistent progress ledger, and local secret/index ignore policy.
- M0.2 added a tested `SessionStart` continuity guard for startup, resume, clear, and compact events.
- M0.3 added a minimal project-local implementation agent pinned to exact `gpt-5.3-codex-spark` with no fallback.
- M1.0 added a dependency-free synthetic byte-stream capture recorder and native TypeScript test harness without network or filesystem I/O.
- M2.1 added static Home Assistant App packaging, mandatory bounded settings, admin-only Ingress, and a fake-tested Node stdlib capture path that reuses the M1 recorder.
- M3.0 added a root Home Assistant repository manifest and slug-matched App bundle folder for URL installation while leaving Supervisor, Docker, Ingress, and EW11 runtime verification deferred.

### Changed

- M0.1 moved the two legacy repositories and their existing aggregate indexes into a separate research workspace without deleting them.
- M0.2 made `AGENTS.md` the canonical per-task bootstrap and evidence contract while relying on the existing global Graphify hook instead of duplicating it locally.
- M0.3 configured Serena for the clean project name and the TypeScript language server; runtime activation remains a post-restart gate.
- M0.3 removed the accidental trailing space from the product root and added a committed, clipboard-ready M0.4 restart handoff.
- M0.3a accepted Serena 1.7.0's canonical project configuration after fresh activation filled omitted defaults, and repaired the restart handoff to require one clean no-rewrite reload before M0.4.
- M0.3b raised the exact Spark implementation agent from `medium` to user-selected `xhigh`; runtime acceptance is deferred to a fresh-process canary with no fallback.
- M0.4 completed the control-plane bootstrap after signed clean-root, stable Serena TypeScript, preserved SessionStart, and exact Spark+xhigh runtime canaries passed read-only component and integrated adversarial audits.
- M2.0 replaced the stale M0-only SessionStart prohibition with a tested milestone-neutral continuity guard and prepared a fresh-process trust/dispatch handoff before any App product code.
- M2.0a replaced the quota-exhausted Spark role with project-local `product_implementer` pinned to exact `gpt-5.6-luna` at `max`, and updated the tested continuity guard; fresh-process trust, discovery, and runtime canary remain required before M2 product work resumes.
- M2.1 completed its static acceptance after two test-first Luna/max repair rounds and a final read-only Sol/ultra audit; Docker/Supervisor and live EW11 behavior remain deferred.
- M2.2 published the signed M2 source to the public `jaemyeong/homeassistant-bestium-eco-foret` GitHub repository without adding unrequested release or Home Assistant repository scaffolding.
