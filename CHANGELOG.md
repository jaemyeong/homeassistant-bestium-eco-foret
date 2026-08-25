# Changelog

All notable changes to this project are documented here.

## [Unreleased]

## [0.2.8] - 2026-08-25

Three captures taken while the operator worked the page settled what "버스가 사용중입니다"
actually was. Reads arrive from the EW11 about every 121 ms, so the timing figures below
are measured, not estimated.

### Fixed

- Stop treating our own disk write as bus traffic. The busy-line test took
  `max(lastRxByteAtMs, lastResumeAtMs)`, and `lastResumeAtMs` is when the capture store
  finished appending a record and resumed the socket. A capture is required for TX, and an
  append follows every read, so every disk write read as a busy line.
- Wait for the quiet window instead of refusing. At a random instant the 20 ms window is
  open 89% of the time; a send that checked it several times succeeded about 64% of the
  time, which is why the operator had to press a button until one landed. The send now
  waits for the window, bounded by `tx_write_timeout_ms`, and a line that never clears is
  still refused with nothing written. The gate itself is unchanged: no frame goes onto a
  line that is talking.
- Let a multi-frame send survive the bus talking between frames. The inter-frame check
  required `rxByteEpoch` and `readEpoch` to hold still across a gap of at least 200 ms, on
  a bus that delivers a read every ~121 ms. Frame two therefore always failed, and the
  failure quarantined the generation and destroyed the transport — which is the
  `partial_indeterminate · framesWritten: 1 · quarantined: true` the operator hit on
  all-zones-off. **That path was reached because 0.2.7 turned all-zones-off into four
  verified frames**; the frames were right, the path was not. What still aborts a macro is
  a transport change, a pending append, or evidence that another transmitter wrote.
- Space F7 sequence frames by the quiet interval rather than 200 ms. The 200 ms figure is
  what the legacy documents for the `0x7F` door macro; an F7 sequence has no such
  requirement and now only waits for the line.
- Give an indeterminate write a way out. `txRetryLocked` was set on
  `partial_indeterminate` and nothing anywhere cleared it, so one failure disabled every
  control until the page was reloaded — the typed confirmation, the challenge, the cancel
  and the capture controls all at once. The lock is right, because the device state really
  is unknown after a partial write, so the release is an explicit operator acknowledgement
  and never an automatic clear on reconnect.
- Let the confirmation field show the whole phrase. It shared a flex row with two buttons
  and showed about half of the 41 characters, so the operator could not check what they had
  typed. It now takes its own row and the type shrinks with the viewport.

### Changed

- A busy line no longer greys out a control or appears in the banner as a blocker. The
  server waits for a window that opens in about 20 ms; announcing that as a refusal is what
  made the page feel broken.
- Lower the speculative cooldown default from 5 s to 1 s. Heating became a candidate in
  0.2.7, so every heating press inherited a five-second wait. The operator working the
  wallpad by hand sent heating commands 500 ms apart and the bus carried them.
  `speculative_tx_cooldown_ms` remains configurable.
- Replace the fixed `wrong-device/collision warning` line on every candidate preview. It
  was boilerplate, not a detection, and it read like a collision the add-on had observed.

## [0.2.7] - 2026-08-25

A capture taken while the operator worked the wallpad by hand carried real commands and
their replies, so heating stopped being guesswork. `.agent/spec-device-protocol.md` has
the full derivation and the evidence tag for every device.

### Fixed

- Send the heating frames the wallpad itself sends. What went out before was shaped like
  a status reply, used sub-command `0x40` where the bus uses `0x46` for On/Off and `0x45`
  for the target temperature, carried the zone as an extra byte, and declared a length one
  short. The wallpad could not parse any of it, which is exactly the "nothing happens" the
  operator reported. All ten commands observed on the bus — four zones on, four off, and
  two temperature settings — are now reproduced byte for byte.
- Correct the length byte in every frame the encoder builds. `makeF7` counted
  `payload.length + 3` for a frame that is `payload.length + 4` bytes. The lights escaped
  because their frames are literal hex; heating did not. The test builder and its assertion
  carried the same off-by-one, which is how an encoder that declared the wrong length passed
  a suite for four releases.
- Stop reading a heating command frame as a source of state. A command says what was asked
  for, not what happened, and the layout the decoder expected only ever fitted the frame we
  had invented ourselves. Encoder, decoder, test builder and test assertion all agreed with
  each other and with nothing on the bus.
- Read the reply that answers a command. The heating reply is 18 bytes and the single-light
  reply is 11; the decoder required 38 and 9 bytes of payload and discarded both. It only
  ever consumed the periodic replies, which is why a send had to wait up to a full 2.2 s
  poll cycle to confirm. Both are now split on the address byte instead of the length.
- Show the direction the elevator is actually travelling. The decoder accepted `0xA5`,
  which appears nowhere in 306 s of capture, and refused `0xA6` and `0xB6`, which are what
  the bus carries while the car moves. A travelling car read as unknown for its whole trip.
- Stop the household call from latching. `call: true` had no clearing path: measured on the
  capture it went true at +274 s and was still true at +306 s. The bus carries no "call
  ended" frame, so the flag now lives exactly as long as the frame that raised it stays fresh.
- Keep the entrance poll frames. All 181 of them were dropped by a length guard, so the
  communal entrance never received a single value in 306 s. What they carry is still unknown;
  they now stamp freshness until a capture with a live call decodes them.
- Report the frames a multi-frame action will send. `frames.map(hexOf)` handed the array
  index to `hexOf` as its byte limit, so the entrance macro previewed as `["", "7f", "7fb8"]`
  while sending the correct bytes.
- Put a button's tinted surface behind its label. `button` opens a stacking context, so its
  absolutely positioned `::before` painted over the text. At 16% opacity the label showed
  through; the six `.warning` buttons run it at full opacity and have rendered as blank
  orange rectangles since 0.2.5 — the three entrance macros, both elevator calls, and the
  candidate challenge button. Found by opening the page in a browser, not by the suite.

### Changed

- Every heating zone is an `inferred_candidate`. Zone 1 alone used to claim `observed` on a
  frame that matched no capture and no command, while zones 2–4 carried the identical
  construction as candidates. The frames are now capture-verified, but the add-on has never
  actuated heating with them and `observed` means one tap with no confirmation, so the
  promotion waits for a live result.
- Call the elevator with a command instead of replaying a status broadcast. What went out
  before was the wallpad's own query to the hallway pad, containing a movement code that
  never appears on this bus. The legacy add-on for this building ships
  `elevator_packet_call_type: 0` and `elevator_packet_command_call_down_value: 6`, which is
  `F7 0B 01 34 02 41 10 06 00 XX EE`. Up is `0x05` by the same builder, but the legacy marks
  call state 5 as 상행호출중(미지원), so the page says so on the button.
- Turn all-zones-off into the four verified zone frames in sequence. Neither the bus nor the
  legacy implementation has a batch heating command; the single frame this used to send was
  invented.
- Name the entrance buttons after what they do. Each sends the legacy door-open macro —
  video bypass on, lock release, bypass off, 200 ms apart — and the label named a state, so
  nothing on the page said that pressing one unlocks the entrance. The card now also records
  that no `0x7F` frame has ever been seen on this bus, that the legacy treats the subphone as
  a separate RS485 line, and that the server's compatibility gate is what blocks these sends.
- Drop the parser's `declared + 1` length candidate. It existed to read the frames we had
  invented; the whole capture reparses identically without it.

## [0.2.6] - 2026-08-25

### Fixed

- Stop the readiness revision from disabling every candidate control. The client
  compared the preview's `readinessRevision` against the one in the next status
  poll, but that value hashes `rxByteEpoch`, `readEpoch`, `validFrameEpoch` and
  `tailHash`, so it moves on every received byte. Measured on the running add-on:
  the revision had already changed 2.5 s after the preview, and the confirm button
  was `DISABLED` while the banner read `awaiting`. The comparison was a duplicate
  of a server check — `send` re-evaluates every gate on the live request and
  re-reads generation, connection, `rxByteEpoch` and `readEpoch` immediately
  before the write — and it was the one copy that could never pass on a live bus.
- Lease the watched light, not the whole page. A pending observation disabled
  every send control, so one light command made every other device wait out the
  observation window. Only `light-<n>-on` and `light-<n>-off` for the watched
  light are now leased; the review and capture controls stay page-wide because
  they are single-instance.
- Shorten the observation window from 10 s to 3 s. State frames on this bus
  arrive about every 1.6–1.9 s, so 10 s was more than five frames of waiting for
  an answer that arrives in one. Note that 3 s leaves under two frames of margin:
  a command that physically succeeded can still end at
  `소켓으로 보냈지만 요청한 상태는 관측하지 못했습니다` on timing jitter alone.
  The value stays configurable as `tx_observation_timeout_ms`.

- Word the server's readiness reasons in Korean at the blocked control. A refused
  send printed the server's own string, so the operator read
  `보내지 못했습니다 · TX cooldown active`. All seventeen reasons
  `evaluateReadiness`, `send` and `issueSpeculativeChallenge` can produce now
  follow the wording the gate banner already used —
  `연속 전송 대기 시간이 남아 있습니다 (TX cooldown active)` — and an unmapped
  reason passes through unchanged, because a raw English string beats a silent
  control. This matters more than it did before: one tap routes every candidate
  through preview and challenge, so these strings are now the operator's primary
  answer to why nothing happened.

### Changed

- Candidate controls now send on one tap, and the page supplies the confirmation
  phrase on the operator's behalf. **This is a deliberate reduction in a safety
  gate, made at the operator's explicit instruction.** Typing
  `I UNDERSTAND THIS IS AN INFERRED CANDIDATE` was a human-attention gate on
  actions whose control codes were never observed; it is gone. What still stands
  for `inferred_candidate` and `unsafe_candidate` actions is the configuration
  flags (`speculative_transmit_enabled`, `unsafe_transmit_enabled`, both off by
  default), the current-generation 7F compatibility proof for entrance macros,
  and the speculative and unsafe cooldowns. The arbitrary-frame lab keeps its
  full three-step flow, so the typed phrase still guards the one path that can
  put any bytes on the bus.

### Added

- Assert the candidate cooldown, which nothing covered before. It is now the only
  rate limit on repeated candidate taps, and it is charged at challenge issuance
  rather than at commit — `send` skips its own cooldown check for an accepted
  challenge precisely because issuance already charged it. Removing either gate
  alone leaves the other standing; removing both lets a second tap inside the
  window put a frame on the bus, and the new test fails on exactly that. It lives
  in `test/tx-cooldown.test.ts` rather than in `test/m2.test.ts`: that file is
  past the size where Node's TypeScript stripping segfaults intermittently, and
  adding roughly 3 KB of anything to it raises the rate. The crash predates this
  release — public `0.2.5` reproduces it about once in thirteen runs — and running
  the same file under a different converter does not reproduce it at all, so it is
  not a defect in the tests or in the add-on. Run the suite more than once before
  reading a single green result as a green suite.

## [0.2.5] - 2026-08-25

### Added

- Move the typed confirmation under the banner that asks for it, and hide it
  until something needs confirming. The operator's report that the light button
  did nothing was exactly this: the second activation lived in a card below every
  control and they never found it. A candidate tap now turns the banner to
  `확인이 필요합니다`, names the action, says the control was never observed, and
  the confirmation card appears directly beneath it.
- Rebuild the debug surface to the design. Packet capture reports elapsed time,
  record count, received bytes, and stored file size with the capture's filename;
  the received-frame log is a table of 계열, 16진수, 해석, and 경과 with the series
  read off the frame's fourth byte and named in Korean; the query-only devices
  are tiles; and the raw lab carries the design's warning banner and its explicit
  1 · 2 · 3 step rail. The capture controls stay on the control surface beside
  the banner that points at them, which is the one place the design's layout is
  not followed and the reason is recorded here.
- Rebuild the heating card as the design's zone cards. The current temperature is
  a 44px numeral with its unit and `현재` label beside it rather than a sentence,
  freshness moves to the zone's state line, and the zones are split into the
  `관측 확인` group that carries Zone 1 and the `추측 후보` group that carries
  Zones 2–4 under an explicit warning that their control codes were never
  observed and may not work.
- Rebuild the control cards as the design's tiles. Lights, gas, the elevator, and
  the entrances now read as an icon, a name, the observed state, and the control
  itself, with the MDI glyphs and the evidence badges the design specifies —
  `추측 후보` on the elevator, `0x7F 매크로` on the entrances. Every element id and
  the bilingual contract text are unchanged, so the emitted UI behaves as before.
- End every send in the banner. A write now narrates itself as
  `보낸 뒤 응답을 관측하고 있습니다`, then resolves to
  `요청한 상태를 확인했습니다` when a later state frame carries the requested
  state, or `소켓으로 보냈지만 요청한 상태는 관측하지 못했습니다` when the
  bounded window closes with nothing. A reconnect during the wait resolves the
  same way. The unobserved ending is not written as a failure — the page says
  plainly that it is not recorded as one — and the banner names the action in
  Korean, so `조명 1 · 켜기` rather than `light · 1 · on`.

### Fixed

- Send an observed control on one activation. A light button used to open a
  preview whose actual write lived behind a second button in a separate card
  further down the page; the operator reported the control as not working
  because they never found that second button, and the frame never left. One tap
  now classifies the action and, when the server calls it observed, writes it
  immediately. A candidate still stops for its typed confirmation, and the RAW
  lab keeps its three steps. Exactly one write per activation, no retry, and the
  pending observation still locks the other controls.
- Stop gating the observed commit on the client's own `readinessRevision`
  comparison. That value is a hash of `rxByteEpoch`, `readEpoch`,
  `validFrameEpoch`, and `tailHash`, so it changed between the preview and the
  next poll whenever a frame arrived. The server re-evaluates every gate on the
  live request and names its own refusal, which is what the page now shows.
- Fail closed on an untrustworthy status: a tap issues no request at all when the
  last status carried no usable revision or the poll failed, and says so.
- Stop binding a speculative challenge to inbound byte counters. `rejectChallenge`
  required `rxByteEpoch`, `readEpoch`, and `readinessRevision` to be unchanged
  between issuing a challenge and committing it, and all three advance on every
  received byte. On a live wallpad bus that made every confirmation a race
  against the next frame, so the commit usually died as
  `challenge RX byte epoch stale` — which is why heating zones 2–4, the elevator,
  the entrances, and the RAW lab only ever worked if the click landed inside the
  gap between frames. The challenge still binds the user, action, frames,
  schedule, transport generation, and our own outbound tail, and every live
  condition the inbound counters stood in for — connected, current-generation RX,
  freshness, the quiet interval, quarantine — is re-checked independently at
  commit time.

### Changed

- Apply the Home Assistant design system across the page, from
  `Bestium Wallpad UI.dc.html` and the design system's own token and component
  files. The stylesheet is rewritten to the HA tokens and `ha-*` component
  geometry, the page gains the design's header bar and a `제어` / `디버그` tab
  row, and the content sits in a centred surface. Every existing element id and
  the two-activation review flow are preserved, so the emitted UI's behaviour is
  unchanged; the design's one-tap switch is deliberately not adopted because it
  would collapse preview and commit into a single activation.
- Replace the twelve transmission-gate chips with one send banner, taken from the
  canonical `SendBanner.dc.html` design. The banner states why control is
  unavailable in terms of consequence rather than gate name, and puts the
  control that clears it in the same box. `off`, `quiet`, `ready`, `sending`,
  and a named-blocker `blocked` state are implemented; `confirmed`,
  `unconfirmed`, and `doorbell` are not, because they need send-result and
  doorbell plumbing the banner does not yet receive.
- Mirror the Home Assistant design tokens the banner consumes as local CSS
  variables for light and dark. An Ingress iframe inherits neither the HA theme
  variables nor its components, and the add-on page takes on no external asset
  dependency, so `_ds_bundle.js` and `ha-components.css` are deliberately not
  used. Values come from the design system's `theme.css`, `typography.css`, and
  `semantic-colors.css`.
- The banner derives its state from the same `tx` booleans the controls use, so
  it cannot report readiness the gate would refuse, and it rewrites only when
  its content changes so the polite live region does not re-announce on every
  poll. Both are pinned by tests.


## [0.2.4] - 2026-08-25

### Fixed

- Unify the three divergent transport-quarantine predicates behind a single
  `quarantinedFor(state)` helper so the status chip, the readiness gate, the
  live write, and the speculative challenge all answer the same question. The
  chip previously keyed on the outbound generation while the gate keyed on
  `validFrameGeneration ?? getGeneration()`, so the UI and the gate could
  disagree.
- Stop treating a fresh transport's `validFrameGeneration` of `0` as
  "generation zero". `attachTransport` sets it to `0` to mean "no valid frame
  observed yet in this generation", so using it as a quarantine lookup key
  reported `transport generation quarantined` for a quarantine that never
  happened. Because the first `startCapture` calls `tx.stop()` before raising
  the generation, generation `0` really is quarantined, and every new transport
  inherited that false reason until its first frame arrived. The blocked
  interval is unchanged — `currentGenerationRx` was already false — but the
  reported reason is now the honest one.
- Render monitor values label-first with their unit: `현재 29°C · stale`
  instead of `29 · stale · currentC`. The raw DTO key no longer trails the
  value, and adjacent monitor spans are block-level so they cannot run
  together.

### Changed

- `boot` is `auto`, the Ingress panel is titled `BESTIUM 월패드`, and the App
  name and description now describe wallpad monitoring and guarded control
  rather than capture alone. `boot: auto` starts the container only; opening a
  socket and starting capture still require an authorized `POST /api/capture`.

### Verification

- Reverting the six product and configuration paths to the parent commit while
  holding the tests at their M4.6 expectations reproduces exactly 5 failures of
  99, measured in this session: `RED: URL-installable repository layout is
  canonical`, `RED: config strictness and exact static contract`,
  `RED: Dockerfile allowlist and pinned production constraints`,
  `RED-exception: actual status JSON drives the emitted UI monitor with 1-based
  device DTOs`, and `M4.6 RED: quarantine chip pins the gate and freshness
  survives an unparsed-byte line`. That demonstrates the tests encode the M4.6
  expectations independently of the implementation; it is not itself evidence of
  authoring order, and the tests-first ordering is inherited from the preceding
  session's record rather than observed here. The full native suite passes
  99/99 on Node `v24.14.1`, `git diff --check` passes, and all four version
  surfaces match `0.2.4`.
- Three targeted mutants are killed by the repaired test. Restoring
  `quarantinedFor` to its old `validFrameGeneration ?? getGeneration()` form
  fails the assertion that a generation which has not yet observed a frame must
  not be reported as quarantined. Making `quarantinedFor` always return `false`,
  which the audit showed the first candidate's chip-versus-gate assertion could
  not detect, now fails the assertion that a stopped generation must be reported
  as quarantined. Removing the readiness gate fails the assertion that an
  observed action must be refused when the last valid frame is stale, and
  removing the send gate fails a different assertion, that no byte reaches the
  socket on a stale line, so the two gates are pinned independently. The tree
  was restored to 99/99 after each.
- An independent adversarial audit found one P0 in the first candidate, and
  repair round 1 closed it. That candidate had narrowed the RX freshness gate to
  inferred and unsafe actions so that an observed action relied on `connected`,
  the quiet interval, and `currentGenerationRx` alone. The justification, that
  transport idle recovery always fires before the removed threshold, conflated
  two different clocks: `onIdleTimeout` is armed on **socket inactivity**, while
  freshness measures **valid-frame age**. On a line that keeps delivering bytes
  that never parse into a valid frame, the socket never goes idle, so no
  reconnect occurs, `validFrameGeneration` and `validFrameEpoch` never change,
  and the exposure is unbounded rather than bounded by `idle_timeout_ms`.
  Running the real coordinator with the last valid frame two hours old and the
  last byte 100 ms old produced `ready: true` with no reasons and wrote
  `f70b01190240110100b6ee` to the socket; the parent commit refused the same
  input with `current RX frame stale` and wrote nothing. The narrowing is
  reverted: `evaluateReadiness` and `send` again require freshness for every
  action class, byte-identical to the parent, and the same input now yields
  `ready: false`, `current RX frame stale`, and no write. The quarantine
  unification and the monitor rendering are unaffected.
- The audit also rejected the first candidate's M4.6 test. Its chip-versus-gate
  assertion compared two values that both derive from the same
  `currentState().quarantined` field, so it held even against an implementation
  that never reports a quarantine, and no other test pinned the quarantine
  readiness gate. That assertion now checks concrete values, and a regression
  test covers the unparsed-byte line for both the preview and the live path,
  asserting that no byte reaches the socket.
- An independent adversarial review was obtained only on the sixth attempt. Five
  freshly spawned read-only reviewers failed first: one
  `403 Unable to verify organization membership`, one `529 Overloaded`, and
  three that executed and returned no report. The sixth succeeded once the
  reviewer was asked to write its report to a file instead of returning text,
  which routed around the failing delivery path. It did not write the code, did
  not inherit the implementer's context, and left the repository unmodified,
  verified against a recorded baseline afterwards. It returned one P0, three P2,
  and one P3, and explicitly contradicted the implementer's own conclusion on
  the P0. The first `0.2.4` product commit was signed before that review existed
  and is superseded by repair round 1 rather than amended.
- A fresh independent re-audit of repair round 1 returned PASS with no new P0 or
  P1. It confirmed by construction, not by reading the diff, that the same input
  is now refused on both the preview and the live path with nothing written,
  that the restored lines are byte-identical to the parent, and that the
  narrowing's removal only widens the blocked set. It traced the single point at
  which a frame reaches the socket, `writeOne`, found `send` to be its only
  caller, and confirmed the speculative-challenge issue and commit paths cannot
  bypass the restored gate. It killed four mutants against the repaired test and
  verified that the new assertions fail against the pre-repair implementation for
  the intended reason. Its highest severity was P2, on the pre-existing
  speculative-challenge wording in `send`, which this release leaves open.
- Graphify is refreshed at 443 nodes/503 edges/42 communities and CodeGraph at
  15 files/527 nodes/2,797 edges. Exact-root Serena 1.7.0 reports TypeScript LSP
  `ready`; `ui.ts` is diagnostic-clean and only the historical missing Node
  ambient declarations remain in `m2.ts` and the native test, because package
  installation is not authorized.
- These are native and static results. They do not prove Home Assistant or
  Ingress behavior, TCP/EW11 behavior, protocol ACK, causality, actual TX, or
  device state. `boot: auto` reaches the installed App only if the user updates
  it in Home Assistant, which this session did not do. This release was
  published to public `main` by an ordinary fast-forward push on 2026-08-25
  after the user explicitly authorized it; GitHub reports the head commit
  `verified: true` / `reason: valid` and the public config parses as `0.2.4`
  with `boot: auto`. No package, Docker, live, external, force-push, or release
  action occurred. Sosumi: N/A because M4.6 contains no Apple API, HIG, or Swift
  claim.

## [0.2.3] - 2026-08-24

### Fixed

- Keep `socket_written_unconfirmed` and `deviceConfirmed:false` as honest
  transport-only results, then show `state_observed_after_write` only when the
  existing status poll observes a fresh, strictly newer, same-generation Light
  1–3 state matching the reviewed ON/OFF request.
- Preserve a commit-preflight state/timestamp/generation baseline so a
  pre-existing desired state, stale/equal/older entry, contradictory interim
  state, or reconnect cannot be promoted to a post-write observation.
- Hold the review, action, Capture/Stop/Download control lease while the
  bounded observation is pending, without adding retry, retransmission, a new
  endpoint, or server receipt state.

### Added

- Add `tx_observation_timeout_ms` with a 10,000 ms default and 1,000–30,000 ms
  bounds. The safe status DTO exposes only the bounded timeout value.
- End an unmatched observation as
  `socket_written_unconfirmed · 소켓 전송됨 · 요청 상태 미관측`; generation
  changes end as `observation_interrupted` without retry.

### Verification

- Exact project-local Luna/max produced the emitted-UI RED before GREEN. Parent
  verification passes M4.5 7/7, the existing observed-action regressions 3/3,
  coordinator single-write coverage, and the full native suite 98/98 on Node
  `v24.14.1`; all four version surfaces match `0.2.3`.
- The first read-only audit found one pending-control P1 and two timing/alert
  P2 findings. Repair round 1 reproduced all three as RED, closed them, and a
  fresh re-audit returned PASS with no actionable P0-P3 and no repeated P0/P1.
- Graphify is refreshed at 436 nodes/496 edges, CodeGraph is current at 15
  files/527 nodes/2,781 edges, and exact-root Serena 1.7.0 reports TypeScript
  LSP `ready`. `ui.ts` and `settings.ts` are clean; only the historical missing
  Node ambient declarations remain in `m2.ts` and the native test.
- These are native/static results. They do not prove browser timer behavior,
  assistive-technology announcements, Home Assistant/Ingress, TCP/EW11,
  protocol ACK, causality, actual TX, or device behavior. No package, Docker,
  live/external, push, or release action occurred. Sosumi: N/A because M4.5
  contains no Apple API, HIG, or Swift claim.

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
