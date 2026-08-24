# Changelog

All notable changes to this project are documented here.

## [Unreleased]

## [0.2.2] - 2026-08-24

### Fixed

- Allow an observed action whose preview was temporarily not ready or whose
  readiness revision changed to become committable only after a successful
  status request that started after the preview completed and reports every
  current TX gate green.
- Keep cached green state and status requests already in flight before preview
  from enabling Commit. Matching ready observed previews retain their immediate
  strict path; inferred and unsafe actions retain strict revision and challenge
  binding.

### Verification

- Exact project-local Luna/max reproduced cached-status and pre-preview
  in-flight request REDs before applying the minimum poll-request epoch fix.
  The three observed regressions pass 3/3 and the full native suite passes
  91/91; all package/config/Docker version surfaces match `0.2.2`, and both diff
  checks pass.
- Current Graphify and CodeGraph flow checks pass. Exact-root Serena reports
  `ui.ts` clean and only the five historical missing Node ambient-module
  diagnostics in the native test. Current official Node 24 and Context7 test
  runner evidence was refreshed. Sosumi: N/A because there is no Apple claim.
- The final read-only adversarial audit passed with no actionable P0-P3. Its
  independent VM canary blocked a pre-preview in-flight response, and a mutant
  that reverted to applied-status timing was killed by the new regression.
- Signed product commit `a8ac99829666e81929805b5c8ec4e553cf34279a` was
  published by ordinary fast-forward. Local `main`, `origin/main`, and
  `git ls-remote` matched; GitHub reported a verified signature and public App
  config version `0.2.2`.
- These native/static results do not prove Home Assistant, Ingress, socket,
  EW11, actual TX, or device behavior. No agent-operated live action occurred.

## [0.2.1] - 2026-08-24

### Fixed

- Keep the App running when TX toggles are enabled without
  `transmit_user_id`. The effective master, speculative, and unsafe TX flags are
  all forced off until a valid configured Home Assistant user ID is present.
- Preserve the existing validation and enabled behavior when a valid
  `transmit_user_id` is configured.

### Verification

- Exact project-local Luna/max reproduced the two intended startup/parser REDs,
  applied the shared-parser fail-closed fix, and passed focused 9/9 and full
  88/88 native tests. Root/App package, App config, and Docker metadata all parse
  or match version `0.2.1`; `git diff --check` passes.
- Current Graphify, CodeGraph, and exact-root Serena checks pass. The product
  source has no new LSP diagnostic; the native test retains only the historical
  missing Node ambient declarations. No package installation, Docker execution,
  Home Assistant/Ingress mutation, network/EW11 access, Capture, actual TX, or
  device action occurred. Sosumi: N/A because there is no Apple claim.
- The read-only adversarial audit accepted the functional candidate and found
  one P2 overstatement in the progress ledger's LSP wording. After that
  documentation-only correction, re-audit passed with no actionable P0-P3.
- Signed product commit `9840bb923286177b509f9348c97ad76445aa1093` was
  published by ordinary fast-forward. Local `main`, `origin/main`, and
  `git ls-remote` matched; GitHub reported a verified signature and public App
  config version `0.2.1`. This is publication evidence, not live App or device
  validation.

## [0.2.0] - 2026-08-24

### Added

- Prepared an uncommitted clean-room `0.2.0` protocol-debug candidate that
  monitors bounded current-generation light, gas, heating, elevator, entrance,
  outlet/ventilation-query, vehicle, CCTV, ambiguous, and unknown evidence
  without copying legacy product code or capture artifacts into this repository.
- Added guarded preview/commit surfaces for the three lights, gas CLOSE only,
  four-zone heating and 5–40°C targets, elevator call candidates, fixed entrance
  candidates, and one bounded RAW burst. Gas OPEN remains structurally rejected.
- Added server-owned TX readiness, user/CSRF binding, exact single-use candidate
  challenges, quiet/cooldown/current-RX checks, one in-flight write, write/drain
  deadlines, partial-write quarantine, and device-unconfirmed outcomes with no
  retry or scheduled/batched transmission.
- Added a dependency-free, offline-only `encodeSingleLightOffCanary()` helper.
  It emits only the three single-light OFF candidates observed at targets
  `0x11`–`0x13`, computes the XOR checksum, and rejects the observed `0x10`
  group/all-OFF target plus every other value.
- Added native tests for the three exact observed frames, independent frame
  length/header/footer/checksum invariants, and runtime allowlist rejection.

### Changed

- Prepared App/config/package/Docker surfaces at `0.2.0` with master,
  speculative, and unsafe TX settings disabled by default. Enabling any TX tier
  requires an explicit configured Home Assistant user ID; no UI control changes
  these server-owned settings.

### Verification

- A fresh standard-library parse of the user-provided `0.1.3` download found
  146,049 complete frames with no invalid checksum or trailing byte. Each of
  the three allowlisted OFF candidates occurred once and was followed 59–63 ms
  later by its corresponding light-state frame. The older download's observed
  `0x10` group/all-OFF candidate is deliberately excluded.
- The additional download SHA-256
  `9df4f4da650ab54c3d0632b97bad29e275459023baf4b98d9576f1d97eb447dd`
  has 7,178 gap-free records and 8,646 complete checksum-valid `F7` frames.
  It directly repeats all three single-light ON/OFF commands and responses,
  while keeping the group/all target `0x10` distinct.
- Read-only protocol comparison finds four heating-state slots but control only
  for zone 1, stable closed gas state without a gas command, and elevator floor
  descent/arrival without a captured call command. The vehicle-arrival mapping
  remains only a timestamp-bounded `0x1E` candidate. No `7F` subphone frame or
  CCTV image/media marker is present; other serial/IP/video links remain out of
  scope. No legacy source or capture was copied into this repository.
- Exact Luna/max produced the intended missing-module RED before adding the one
  pure encoder file. Parent verification passes the focused tests 2/2 and the
  complete native suite 36/36; current Graphify shows only the test import into
  the encoder, and the encoder has no Serena diagnostic.
- The initial read-only product/test audit passed with no actionable P0-P3 and
  confirmed the exact four-path boundary, empty staging, test-only reachability,
  focused 2/2, full 36/36, and `git diff --check`. Its closure recheck found one
  stale-roadmap P3; after that line was repaired, the final bounded read-only
  recheck passed with no actionable P0-P3.
- The helper is not imported by the App runtime and adds no socket write,
  Ingress route, UI action, retry, or arbitrary-hex surface. No Home Assistant,
  EW11/private-LAN, device, or live TX action occurred. Sosumi: N/A because this
  work contains no Apple API, HIG, or Swift claim.
- For the `0.2.0` candidate, exact Luna/max tests-first work produced 51/60 RED
  with nine intended failures, then 60/60 focused GREEN and 64/64 full native
  GREEN. JSON/version parsing, emitted-script compilation, dependency checks,
  `git diff --check`, current Graphify/CodeGraph, and exact-root Serena checks
  pass; the only LSP errors remain the historical absent Node ambient types.
- Final read-only runtime and accessibility re-audits returned **FAIL / STOP**.
  Repeated P1s remain for late preview/challenge resurrection after Cancel,
  stale operator readiness, incomplete ambiguous/query/unknown freshness,
  non-contiguous or incorrectly refreshed `7F` door proof, and UI suppression of
  `partial_indeterminate`. The candidate remains uncommitted and unstaged.
- The user explicitly authorized one narrowly bounded fourth fake/static repair
  for those five P1 families without authorizing any live or external action.
  Exact Luna/max tests first reproduced 60/65 with exactly five intended
  failures, then reached 65/65 focused and 69/69 full native GREEN. Parent JSON,
  version, emitted-script, dependency, diff, Graphify/CodeGraph, and exact-root
  Serena checks also pass.
- Fourth-round runtime and accessibility audits nevertheless returned
  **FAIL / STOP**. Capture can overtake unresolved authenticated challenge
  cancellation; `partial_indeterminate` can render an absent quarantine field
  as false; old-generation ambiguous/unknown evidence can render as fresh; and
  a never-settling status poll has no deadline to invalidate an enabled commit.
  These repeated P1s are not covered by the passing native suite. The candidate
  remains uncommitted, unstaged, and ineligible for live use.
- The user explicitly authorized one fifth fake/static repair limited to those
  four P1 families. Fresh Graphify, CodeGraph, exact-root Serena, current
  WHATWG/Node/Home Assistant/Context7 evidence, and an exact Luna/max canary
  preserved the Good-signed baseline, exact 13-path candidate, and empty stage.
- Pre-repair VM/transport canaries reproduced Capture before late authenticated
  challenge cancellation, missing authoritative partial quarantine, stale
  old-generation detail rendered fresh, and a hung status request with no
  readiness deadline. Focused 65/65 and full 69/69 still pass, confirming the
  new tests must cover these races before product repair.
- A first read-only repair-plan audit found that serializing only challenge and
  Capture paths omitted live Commit and Stop. The corrected minimum uses one
  rejection-safe local FIFO for all five mutation paths plus a synchronous
  pending-Commit Capture guard; the second plan audit passed with no actionable
  P0-P3 before test or product changes.
- Exact project-local Luna/max then changed only `test/m2.test.ts`. Parent
  reproduced focused 63/68 with exactly five intended failures: authoritative
  partial quarantine, missing-quarantine display, deferred challenge/Capture
  ordering, ingress mutation serialization, and fail-closed debug freshness
  including a bounded poll deadline/epoch. Product/config hashes and staging
  remained unchanged; no full suite was run while deliberately RED.
- The same exact implementer applied the minimum GREEN in the existing ingress,
  TX, protocol-snapshot, and emitted-UI roots. It adds one rejection-safe FIFO,
  a challenge/cancel Capture barrier, authoritative partial quarantine,
  fail-closed debug freshness, and a native five-second abort/epoch status poll.
  A bounded pre-audit cleanup also proves FIFO recovery after rejection and
  locks an aborted no-ID challenge as indeterminate without a Capture POST.
- Implementer and parent pass focused 68/68 and full 72/72. JSON/package/config/
  Docker `0.2.0`, inline-script compilation, gas CLOSE-only control with OPEN
  rejected, browser-dependency absence, diff/path/artifact/stage checks,
  refreshed Graphify 420-node flow, current CodeGraph source, and Serena checks
  pass; only the historical missing Node ambient diagnostics remain.
- Both final read-only audits nevertheless returned **FAIL / STOP**. Runtime
  canaries show that a matching-revision 200 challenge response without a usable
  ID resolves the barrier and permits `issue-request -> stop-post`; handler-local
  outstanding state can also outlive authoritative consumption/expiry. The
  verified FIFO, rejection recovery, and partial quarantine otherwise pass.
- Accessibility/state canaries show that over-age or malformed time/generation
  values can still render fresh, CCTV lacks the same freshness contract, and a
  possibly dispatched Capture with a lost response remains retryable without
  reconciliation. Additional P2 control/accessibility defects are recorded in
  M4-E36. Repeated P1s consume the fifth-round exception: the candidate remains
  unstaged, uncommitted, and ineligible for live use pending fresh authorization.
- The user explicitly authorized a sixth fake/static repair limited to challenge
  ID/expiry validation, authoritative outstanding-challenge lifecycle, bounded
  fail-closed protocol/CCTV freshness, and post-dispatch Capture uncertainty.
  Fresh entry checks preserve the exact 13-path candidate and empty staging;
  focused 68/68 and full 72/72 remain green before the new tests-first RED.
- Current WHATWG Fetch, ECMAScript numeric-validation, Node 24, Home Assistant,
  Context7, Graphify, CodeGraph, and exact-root Serena evidence was refreshed.
  UI/protocol diagnostics remain clean; only the historical no-package Node
  ambient diagnostics remain. Sosumi: N/A because there is no Apple claim.
- Two read-only plan repairs converged on the minimum fail-closed design: one
  bounded local challenge record only when no authoritative dependency exists,
  valid-frame-backed CCTV negative evidence, and a page-lifetime Capture lock
  driven by the existing five-second AbortController/epoch pattern. The final
  plan audit passed with no actionable P0-P3.
- Exact Luna/max changed only `test/m2.test.ts`; parent reproduced focused 68/72
  with exactly four intentional failures for challenge response validation,
  consumed/expired challenge lifecycle, typed protocol/CCTV freshness, and
  Capture/Stop mutation deadline plus sticky uncertainty. All prior 68 tests
  remain green, staging is empty, and `git diff --check` passes.
- The same implementer applied the minimum GREEN in the existing coordinator,
  Ingress, protocol snapshot, and emitted UI roots. Consumed/expired challenges
  no longer remain outstanding, CCTV negative evidence is backed by a real
  current-generation valid frame, malformed freshness/challenge DTOs fail
  closed, and uncertain Capture/Stop POSTs lock until page reload after a native
  five-second deadline while late settlement is ignored.
- Implementer and parent pass focused 72/72 and full 76/76. Parent JSON/version,
  inline-script, gas CLOSE-only, browser-dependency, diff, exact-path, artifact,
  empty-stage, refreshed 420-node Graphify, current CodeGraph, and Serena checks
  pass; only the historical no-package Node ambient diagnostics remain.
- No Home Assistant/browser/Ingress action, real socket or EW11/private-LAN
  access, packet transmission, device change, package installation, Docker,
  push, or release occurred. Passing fake/native checks do not prove live
  transport or device behavior. Sosumi: N/A because this work has no Apple API,
  HIG, or Swift claim.
- Both sixth-round final audits returned **FAIL / STOP** despite focused 72/72
  and full 76/76. Immediate Capture/Stop clicks can emit duplicate POSTs, and
  indeterminate challenge/partial outcomes do not keep the native controls
  disabled because the rendered busy/retry lock is not wired into `draw()`.
- Current-device freshness is not gated by the global current-generation valid
  frame and its age; CCTV can therefore assert current non-observation while
  stale, wrong-generation, absent, or stopped. Fallback challenge handling also
  treats a truthy `{cancelled:false}` result as success and can erase a valid
  outstanding challenge after a malformed issue response.
- The runtime audit also found whitespace-only challenge IDs, malformed visible
  generations, and new TS2345 fake-dependency diagnostics in `test/m2.test.ts`.
  Repeated P1s consume the sixth-round exception: all 13 candidate paths remain
  unstaged and uncommitted, and another repair requires fresh authorization.
- The user explicitly authorized a seventh fake/static repair limited to those
  sixth-round findings and fresh final audits. Exact-root entry preserved the
  Good-signed baseline, the same 13 dirty paths, empty staging, focused 72/72,
  full 76/76, and the two new TS2345 diagnostics; no live/external action is in
  scope.
- Current WHATWG HTML/Fetch, ECMAScript, Node 24, Home Assistant, Context7,
  Graphify, CodeGraph, and Serena evidence was refreshed. The first read-only
  plan audit found an unknown-issued-challenge gap and negative-generation gap;
  a separate bounded 30-second unknown guard plus nonnegative generation checks
  closed both, and the repaired plan passed with no actionable P0-P3.
- Exact Luna/max then changed only `test/m2.test.ts` and added three bounded
  seventh-round regressions. Parent execution reproduces all three intended
  failures. It also found one older redaction assertion can spuriously match the
  port digits inside a real-time millisecond timestamp; GREEN may repair that
  test structurally without weakening endpoint/user redaction coverage.
- Minimum GREEN adds synchronous Capture/Stop single-flight locking, sticky
  indeterminate native controls, global current-frame freshness for all device
  and CCTV wording, exact 32-character base64url fallback IDs, explicit-true
  cancellation, and an independent 30-second unknown-issue guard. Initial CCTV
  text is unknown/stale, and redaction tests now inspect endpoint keys instead
  of a real-clock-sensitive numeric substring.
- Implementer and parent pass focused 75/75 and full 79/79. JSON/version and
  dependency checks, inline-script compilation, gas CLOSE-only guards, exact
  path/artifact/empty-stage/diff checks, refreshed 420-node Graphify, current
  CodeGraph, and exact-root Serena checks pass. The prior TS2345 test findings
  are gone; only historical missing Node ambient declarations remain. Fresh
  runtime/accessibility acceptance is still required before a signed commit.
- Both final read-only audits nevertheless return **FAIL / STOP** on one
  independently reproduced repeated P1. A timely Capture or Stop 200 response
  starts fire-and-forget status reconciliation, but the apparent `await` returns
  immediately and the `finally` block releases the native busy lease. If the
  status request is deferred, both controls enable against stale phase and a
  second mutation POST is accepted. The 79 passing tests miss this
  post-acknowledgement window.
- No other actionable P0/P2/P3 was confirmed. The exact 13-path candidate stays
  unstaged and uncommitted; another repair requires fresh explicit authorization.
  Fake/static evidence remains neither browser/AT nor Home Assistant/EW11/device
  proof, and no live or external action occurred.
- The user explicitly authorized one eighth fake/static repair limited to that
  post-acknowledgement mutation P1, fresh runtime/accessibility audits, and a
  signed local commit only after final PASS. All live/external gates and push
  remain unauthorized.
- Eighth-round re-entry preserved the Good-signed baseline, exact 13 dirty paths,
  empty staging, current Graphify/CodeGraph flow, exact-root Serena TypeScript
  `ready`, focused 75/75, full 79/79, and a clean diff check. Current WHATWG and
  Node 24 evidence was refreshed; Sosumi is N/A because there is no Apple claim.
- The first eighth-round plan audit found unresolved superseded-poll awaiters and
  unknown-phase controls. Exact-once poll completion, strict CapturePhase cache
  invalidation, endpoint/phase rechecks, and initial fail-closed controls closed
  both; the repaired plan passed with no actionable P0-P3 before any product edit.
- Exact Luna/max then changed only `test/m2.test.ts`. Parent reproduced all three
  intended REDs: missing initial disabled controls, post-200 busy release during
  deferred reconciliation, and fail-open malformed reconciliation. The tests
  additionally bind Capture/Stop success phases, deadlines, late settlement,
  sticky locks, background invalidation, and poll supersession.
- Minimum GREEN keeps the existing poll and mutation roots: Capture/Stop starts
  disabled, uses one strict cached runtime phase, awaits bounded forced status,
  settles superseded polls exactly once, rechecks endpoint phase across awaits,
  and enters the existing sticky mutation lock on reconciliation failure.
- Exact Luna/max and parent verification pass focused 78/78 and full 82/82.
  JSON/version/dependency, emitted-script, gas CLOSE-only, exact-path/artifact/
  empty-stage/diff, refreshed 420-node Graphify, current CodeGraph, and Serena
  UI/protocol checks pass; only historical missing Node ambient types remain.
- The first eighth-round audits still returned **FAIL / STOP**. A valid but
  contradictory post-200 phase reopened the same Capture or Stop control, and
  Capture/Stop busy state did not exclude Issue/Commit/Cancel in the reverse
  direction. Controlled activation could therefore send a second native
  mutation or overlap a review mutation; no live endpoint was exercised.
- Repair round 1 added two exact Luna/max regressions, which parent reproduced
  at 0/2. Minimum GREEN requires Capture to reconcile to `running` and Stop to
  `stopped`, otherwise entering the existing sticky lock, and synchronizes the
  native plus programmatic Issue/Commit/Cancel guards with the capture lease.
- Parent now passes focused 80/80 and full 84/84 after one stale Stop fixture was
  mechanically aligned to return `stopped`. JSON/version/dependency,
  emitted-script, gas CLOSE-only, exact-path/artifact/empty-stage/diff,
  refreshed 420-node Graphify, current CodeGraph, Good baseline signature, and
  Serena gates pass; fresh runtime/accessibility acceptance remains pending.
- Repair-round-1 runtime audit passed with no P0-P3, while accessibility passed
  both remanded P1s but found generic review busy disabled native Cancel during
  a pending Preview/challenge issue. It also found no live progress message for
  deferred status reconciliation or challenge issuance. Real browser and AT
  interaction were not run.
- The second and final repair round added two exact Luna/max tests, reproduced
  by the parent at 0/2. Minimum GREEN adds one cancellation-in-flight guard so
  pending review requests remain cancelable without duplicate cancellation,
  and reuses the existing `status`/`outcome` live regions for bilingual progress.
- Parent passes focused 82/82 and full 86/86. JSON/version/dependency,
  emitted-script, gas CLOSE-only, exact-path/artifact/empty-stage/diff,
  refreshed 420-node Graphify, current CodeGraph, Good baseline signature, and
  Serena gates pass; final runtime/accessibility acceptance remains pending.
- Final repair-round-2 runtime audit passed with no actionable P0-P3. Final
  accessibility audit confirmed every P1 closed but failed on one P2: after an
  authoritative challenge cancellation returns the review to idle, the live
  `outcome` still says `Issuing challenge` or `Challenge issued`.
- Both permitted repair rounds are consumed without both-auditor PASS. The
  exact 13-path candidate remains unstaged and uncommitted; an exceptional
  cancellation-status repair requires fresh explicit authorization. No real
  browser/AT, Home Assistant, Ingress, network, EW11, capture, or TX action ran.
- The user explicitly authorized one exceptional third fake/static repair only
  for that cancellation-status P2, fresh runtime/accessibility audits, and the
  contract-required signed local task commit after both audits pass. Push and
  every live/external action remain unauthorized.
- Exact Luna/max added only cancellation-outcome assertions for RED; the parent
  reproduced 0/1 with empty `Review canceled` and stale `Issuing/Issued`
  outcomes. Minimum GREEN changed only the shared `cancelReview` path to announce
  local cancellation, authenticated challenge-cancellation progress, and
  authoritative success without overwriting indeterminate failure.
- Parent passes m2 71/71 and full 86/86 plus JSON/package/config/Docker `0.2.0`,
  dependency absence, emitted-script compilation, gas CLOSE-only and OPEN
  rejection, diff/path/artifact/empty-stage, refreshed Graphify, current
  CodeGraph, Good entry signature, and exact-root Serena checks. Only historical
  absent Node ambient diagnostics remain. Current WAI-ARIA and Context7 Node 24
  evidence was refreshed; Sosumi: N/A because there is no Apple claim.
- Fresh independent runtime and accessibility audits both pass with no
  actionable P0-P3. Their fake VM/native/static canaries close cancellation
  ordering, sticky failure, native control/focus/live-region, DOM, contrast, and
  prior TX/freshness/quarantine/default-off safety gates. No real browser/AT,
  Home Assistant/Ingress, network/EW11, Capture, actual TX, or device behavior
  was tested or authorized.
- The user explicitly authorized publication after the signed clean M4.2 task
  commit was reported. Both pending commits verified Good and a normal
  fast-forward push advanced public `main` from `ce3f828` to product commit
  `677be450e6cb7b3a2efd5d90a966ed97b49095f0` without force.
- Local `HEAD`, `origin/main`, and `git ls-remote` matched the product commit;
  GitHub's public commit API reported its signature verified and the public App
  config parsed as `0.2.0`. This publication does not prove or authorize an
  agent-operated Home Assistant update, Ingress/network/EW11 access, Capture,
  actual TX, or device behavior; the user will run those live steps separately.

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
