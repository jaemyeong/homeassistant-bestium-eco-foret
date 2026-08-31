# Changelog

All notable changes to this project are documented here.

## [0.5.5] - 2026-09-01

### Fixed

- A command refused after one of its frames had already reached the bus was reported as
  `rejected` — as though nothing had been sent. The operator's log caught it on the elevator:

  ```
  bestium-eco-foret/cmd/elevator DOWN -> rejected (1 frame(s), capture append pending)
  ```

  The first attempt put a down-call frame on the wallpad. The second was refused because a
  capture append held the transport paused, and `capture append pending` is not in the retry
  policy's list, so the loop returned there and skipped the tail below it — the very code that
  states the invariant: *a frame that reached the bus must never be reported as "not sent"*. The
  count beside the outcome said `1 frame(s)` and contradicted the word next to it.

  That answer is what an operator acts on. Reading `rejected`, they press again, and the car is
  called twice. The same path is reachable for the gas valve and batch-off through
  `transport not connected` and `transport generation changed while waiting for the line`, both
  of which follow a write deadline that quarantines the generation and destroys the socket.

  A non-retryable refusal now ends the loop instead of returning from it, so the tail answers:
  `unconfirmed`, with the reason it was refused and how many frames went out. `attempts` reports
  the attempts actually made rather than the whole budget.

  `0 frame(s)` is unaffected: a command refused before anything was written is still `rejected`.

## [0.5.4] - 2026-08-31

### Fixed

- The bridge parsed its own command-topic clears. It publishes a zero-length retained payload to
  every command topic on connect, because nothing else ever deletes a retained message — and
  `Number("")` is 0, so an empty payload on a temperature topic became a real
  `{kind: "heat", temperatureC: 0}` action, refused only by the encoder's 5-40 °C range check
  well downstream. An empty or whitespace payload is now no command anywhere.

- Those clears were being republished while the subscription was live. They go out before
  subscribing, so the bridge never receives its own — but Home Assistant's birth message ran the
  same sequence again, and then it did. That put one "dropped an unrecognised command" line in
  the log per command topic on every Home Assistant restart. The clears now happen on connect
  only; the rest of the republish is unchanged.

## [0.5.3] - 2026-08-31

### Fixed

- The batch-off entity had no icon. `mdi:home-lightbulb-off` has never existed in Material Design
  Icons — it is absent from every release of `@mdi/svg` including 7.4.47, the newest and the one
  Home Assistant pins. An unknown name fails silently by design: the frontend fetches its icon
  chunk, finds nothing, and renders an empty 24-pixel `<svg>` with no error anywhere. It is now
  `mdi:lightbulb-group-off`, which is what Home Assistant core uses for a light group's off state,
  and a test checks every icon the payload ships against a list of names verified to exist.

- An elevator call now logs how many frames reached the bus. A `button` entity gives Home
  Assistant no failure feedback at all, so that log line is the only place an operator can tell
  "written three times and never observed" from "superseded before it was written".

  This came from a report that calling the car to the floor it is already standing on does
  nothing. The measurements say otherwise: in run `elev-revoke`, with the car parked at floor 4
  after 45 seconds of an idle line, our down-call frame went out and 1,838 ms later — inside the
  measured registration band — the bus carried an arrival for floor 4. The building accepts the
  call. What it cannot do is confirm it: an arrival frame carries no direction, and the same
  frame ends every journey from every origin, so accepting it as proof would confirm a
  neighbour's arrival as our press. `unconfirmed` is the permanent honest verdict for that case,
  and a test now pins it as a decision rather than an oversight.

  Whether the doors actually open is not on this line at all. That needs someone standing at the
  lift.

### Changed

- A heating target sent over MQTT for a zone that is off powers that zone on again, the way the
  page and the wallpad do. 0.5.2 had the dispatcher refuse it; the operator has decided against
  that.

  The reasons the refusal was worth undoing are the ones stated when it went in: MQTT carries no
  channel for declining a command, so the refusal was silent and an automation believed it had
  succeeded, and the same device answered differently on the two surfaces. The side effect itself
  is real and measured — eight of eight, all four zones — and it stays in the documentation.

  The encoder's own refusal is unchanged and is about values rather than state: below 5 °C or
  above 40 no frame is built, whatever the zone is doing.

- The add-on documentation said the elevator call buttons ship disabled. They have shipped enabled
  since 0.5.1 and the documentation was not updated with the code.

## [0.5.2] - 2026-08-31

### Fixed

- A heating target sent over MQTT for a zone that is off powered that zone on. Refusing it was the
  operator's decision, recorded in the decisions table of `.agent/plan-mqtt-bridge.md`, and the
  dispatcher never carried it.

  Writing a target powers its zone on — eight of eight, all four zones — and that is exactly the
  call a night-setback automation makes. The refusal is silent, because MQTT carries no way to
  tell Home Assistant a command was declined: the automation believes it succeeded and sees the
  target unchanged at the next poll. A zone nobody has polled is refused too, since not knowing
  whether it is on is not a reason to burn gas. Turning a zone on is never refused — that is the
  operator asking for exactly what it does.

  The page is deliberately unchanged and keeps behaving like the wallpad, so the same device
  answers differently on the two surfaces.

- The add-on's documentation described this refusal before it existed.

### Internal

- The specification now says, at the top, that its body is the research output and the decisions
  section overrides it. Reading only the body is how this and the elevator buttons were both
  missed; both were recorded correctly and neither reached the code.

## [0.5.1] - 2026-08-31

### Fixed

- The two elevator call buttons shipped disabled. The operator had chosen to enable them, and the
  decisions table in `.agent/plan-mqtt-bridge.md` recorded that choice correctly; the code carried
  the specification's original recommendation instead. Batch-off stays disabled, which is what was
  chosen for it.

  Nothing about the reasoning changed: a call brings a shared car the neighbours see, the building
  offers no cancel, and a `button` gives Home Assistant no failure feedback, so the auto-generated
  Overview renders two bare PRESS tiles beside the light toggles. A `confirmation:` on a dashboard
  tile is the answer to that, and MQTT discovery cannot express one.

## [0.5.0] - 2026-08-31

### Added

- Home Assistant entities over MQTT, discovered automatically. Sixteen of them on one device: the
  three lamps, four heating zones, the gas valve, batch-off, three elevator readouts, two elevator
  call buttons, and the entrance door.

  Three of those needed a decision rather than a mapping.

  **Gas can only be closed.** It is a `valve` whose `payload_open` is a literal `null`, and that
  is not a UI convention — Home Assistant builds a valve's supported features from the presence
  of each payload, so `open_valve` is never registered on the entity. Omitting the key would have
  granted the unsafe direction through a default. Reopening needs no design: a person opens the
  valve by hand and the next poll reports it.

  **The elevator's floor is readable only while a call stands.** It publishes the string `None`
  for a floor the frame does not carry, beside `none` for a car that is standing — a value that
  is unknown and a value that is measured, kept apart. Between calls the device is still
  answering every 1.2–2.0 s, so an absence of frames is a fault and the availability topic says
  so; marking it unavailable while merely idle would have read as a broken integration.

  **The door has no closing notification**, so it is an `event` entity. An event's state is the
  timestamp of the last one, which needs no interval to return from — and the 1.38 s burst is the
  length of the notification, not of the door being open, so there was nothing to derive one from.

  Every published value comes from the poll's own copy of the device state, never from the reply
  to our own write. Commands arrive on `bestium-eco-foret/cmd/#` and go through the same send path
  the page uses, so they inherit the intent queue, the poll-based confirmation, the retry budget,
  the single-writer rule and the silent-query gate.

  A retained command is never executed. A broker replays retained messages to every new
  subscriber, so one publish with the retain flag set on the gas topic would otherwise close the
  valve on every reconnect, permanently, with a person walking to it each time. The bridge also
  clears every command topic on connect, because nothing else ever deletes a retained message.

  Batch-off and the two elevator buttons arrive disabled. `switch` is in Home Assistant's default
  voice domains and falls through to `switch.turn_on`, so with no operator action "turn on
  everything" would reach batch-off with ON — which darkens the whole home, including rooms the
  wallpad cannot otherwise address.

- One new option, `mqtt_commands_enabled`, off by default. The broker's address and credentials
  come from Supervisor's `/services/mqtt`; the legacy add-on had twelve knobs for what is now one
  HTTP GET and one boolean.

### Internal

- `src/mqtt.ts` is a hand-rolled MQTT 3.1.1 client, about 900 lines including the bridge. The
  image forbids a package manager, and the two alternatives were worse: vendoring the one
  maintained zero-dependency client puts its files where `addon-image.test.ts`'s closure walker
  cannot see them, and npm would put sixteen transitive dependencies on a bus that closes a gas
  valve. `.agent/plan-mqtt-bridge.md` §5.2 carries the ranking.

### Internal

- The decoder keeps a second copy of each device's state, written only by the frames the wallpad
  polls with. The tree it exposes was written by both the periodic frames and the replies that
  answer our own writes, and three measurements say a reply proves nothing: gas answers
  byte-identically whether or not the valve moved, a heating zone echoed a target it did not
  adopt, and a group command draws no reply at all. The send path already judged by the poll, by
  comparing timestamps; the tree itself did not, so anything reading it as truth read the echo.
  Nothing reads the new field yet.

## [0.4.2] - 2026-08-31

### Fixed

- Batch-off did nothing. The page reported `action rejected`, and the ingress was answering 400
  while the encoder was building the frame perfectly well.

  The ingress and the encoder each keep a list of which fields an action kind may carry, and an
  unlisted kind falls back to allowing `kind` alone — so `{kind: "batchoff", state: "on"}` failed
  on `state`. Batch-off reached the encoder when the action contract was rewritten for the new UI
  and never reached the ingress list.

  The same drift ran the other way: `outlet` and `ventilation` were still listed at the ingress
  after measurement showed this wallpad has neither module and the encoder dropped them, and `raw`
  was listed while the encoder throws on it. All three are gone.

  This one mattered more than most. The batch-off switch by the front door is the only path to
  the other rooms' lights — the wallpad cannot reach them at all — so the add-on's largest single
  action had been unreachable since the rewrite.

### Internal

- `test/link-recording.test.ts` now walks every control the page offers through both the encoder
  and the ingress. Nothing compared the two lists before.

## [0.4.1] - 2026-08-31

### Fixed

- Read and write did nothing until the packet capture had been started once. After that one
  press, stopping the capture left them working — which is what identified the defect, because
  no race behaves that way.

  `getState()` reports a finished recording by spreading `lastResult` and re-overriding `phase`,
  on the stated reasoning that phase belongs to the link rather than to the file. `generation`
  and `protocol` belong to the link on exactly the same reasoning and were not overridden.

  `/data/captures` is a persistent volume and nothing deletes from it, so once one capture has
  finished, every later boot has `store.recover()` hand that file back and `metadataFromRecovered`
  seed `lastResult` with a description of it. A file has no generation and no decoded devices.
  Served as link state, that meant `getGeneration()` returned 0 while `attachTransport` had
  already bumped the live generation to 1, so every send was refused with one reason — "no
  current-generation valid RX frame" — on a link that reported up and was decoding the whole
  time; and the status response fell back to a `{generation, stale}` stub with no `devices`,
  which is the page's only source for its device tiles. Both halves dead from one omission.

  Starting a capture sets `lastResult = null`, and the recovered value is read once at
  construction and never again. That one-way eviction is why a single press cured it for the
  life of the process and stopping did not bring it back.

  The same omission had two further effects that are fixed with it: device tiles froze at the
  moment a capture was stopped rather than tracking the bus, and a transport reconnect re-broke
  sending because the reported generation stayed at its stop-instant value.

### Internal

- `test/link-recording.test.ts` gains the boot this add-on actually performs on the operator's
  hardware: a store whose `recover()` returns a finished capture. The existing test for control
  without a capture passed only because the test store's `recover()` returns null unconditionally,
  so the runtime under test was never the one that ships.

## [0.4.0] - 2026-08-31

### Changed

- The 구성 panel offers four options instead of sixteen: `ew11_host`, `ew11_port`,
  `transmit_enabled` and `transmit_user_id`. The thirteen that went are measurements — poll
  cadences, quiet intervals, capture ceilings — and they are constants in `settings.ts` now,
  next to the comments that justify them.

  This is a fix, not tidying. Supervisor merges an add-on's defaults *under* whatever the
  operator saved and the saved side wins, so an install whose form had ever been submitted kept
  its old values however good a number a later release shipped. One install still held
  `tx_observation_timeout_ms: 3000`, visible on the page as the send banner's "최대 3.0초".
  3,000 ms holds exactly one 2,300 ms heating poll: the write lands, the next poll may still
  carry the state from before the command, and the poll that would show the effect falls
  outside the window. `awaitConfirmation` then returns false and the caller retries, spaced only
  by `tx_cooldown_ms` — 250 ms, against the 3,217–3,248 ms that separated the transmits measured
  to succeed. A command the device had obeyed was reported unconfirmed and sent twice more.

  Removing a key from the schema does not remove it from `/data/options.json`; Supervisor keeps
  it and logs that it is not in the schema. The parser is what makes it inert, and
  `addon-defaults.test.ts` proves it with the operator's own 3,000 ms as the case.

### Fixed

- A send now waits for the wallpad to query a device that never answers, and writes into the gap
  that leaves. That gap is the only place on this line where an eleven-byte frame fits every
  time: 7,019 such queries in `capture-1788009200284` fitted 100% of the time, against 42% for a
  60 ms quiet window. Across the 34 measured runs, 194 transmits through that gate were answered
  94.4% of the time with no damaged byte, while 183 that waited for a quiet interval were
  answered 75.4% of the time and damaged 959 bytes. On light 1, which carries the largest sample,
  it is 91 of 91 against 135 of 178.

  Waiting for the line to look quiet is not merely weaker, it is structurally late: the gateway
  holds bytes until the serial line has been silent for its own 50 ms gap timer, so that
  judgement is always 50 ms out of date, and writing on it is what produced the collisions. A
  query to a device that never answers is different in kind, because it guarantees a window ahead
  rather than reporting one behind.

  The quiet interval stays as the fallback. Windows are a median 345 ms apart and 99.8% of gaps
  are under a second, so a send waits up to a second for one; past that it sends on the rule that shipped
  before this. A link that has just reconnected waits too, rather than falling straight back:
  relinking resets what the decoder has seen, and a reconnect is when a send is most likely to
  be pressed.

### Added

- The status response and the send banner carry `unparsedByteCount`: the bytes the decoder threw
  away since the link came up. Across the 34 measured runs, 194 transmits through buslab's
  silent-query gate damaged nothing while 183 that waited for a quiet interval damaged 959
  bytes — and the add-on waits for a quiet interval. Every one of those runs was buslab's;
  nothing has ever run the add-on on the bus and counted, so this figure is what turns one
  deployment into an answer. A line carrying only the wallpad's own traffic reads zero, so the
  banner shows the count only when it is not.

### Removed

- `speculative_transmit_enabled` and `speculative_tx_cooldown_ms`. The flag gated actions graded
  `inferred_candidate`, and `inferred()` in `protocol-debug.ts` has no callers — measurement
  promoted the last of them. The branch stays in the source for the subphone line, which is not
  captured yet.
- `unsafe_transmit_enabled` and `unsafe_tx_cooldown_ms`. They gated the entrance door macros,
  which the page does not offer and eleven sends showed to be inert on this line. Hardcoded off
  is narrower than a switch an old options file could still be holding open.

### Fixed

- The page header printed `애드온 0.3.0` on 0.3.1, 0.3.2 and 0.3.3. Four checks pin the version —
  `config.json`, both `package.json` files, the Dockerfile label — and the page was none of them,
  so the one surface an operator actually reads was the one nobody verified. It is checked now.

### Internal

- Four suites built their settings by calling `parseM2Settings` with timing overrides, which is
  how they kept a fake clock short. The parser no longer reads those keys, so they assemble the
  object from `DEFAULTS` instead. `tx-bus.test.ts` was the one that showed it: with a 4,600 ms
  window against a fake timer nobody advanced, it stopped terminating.
- The parser's numeric-bounds sweeps in `m2.test.ts` are gone with the options they validated.
  What replaces them is narrower and more to the point: `addon-defaults.test.ts` checks that a
  stored value for a retired key cannot reach the running add-on.

## [0.3.3] - 2026-08-31

### Changed

- A capture no longer stops five seconds after it starts. `capture_duration_ms` shipped as
  5,000 ms, which is two polls of a single device and closes the file before it holds enough
  to read. It is now ten minutes, and the byte and record ceilings were raised to 1 MiB and
  20,000 so that a capture ends on its duration rather than stopping early on a limit. The bus
  measures 106.9 B/s and 5.37 reads/s across the 6,415 s of captures kept from the M4
  campaign, so ten minutes is roughly 63 KiB in about 3,200 reads.

### Fixed

- `settings.ts` described the observation window as three polls of the slowest device; it has
  been two since the constant was derived from `DEVICE_POLL_MS`. Two is the right number and
  the reason is now stated: a write lands, the next poll may still carry the state from before
  the command, and only the poll after it reports the effect.

### Note for existing installations

- Home Assistant merges an add-on's defaults *under* the options the operator has saved, and
  the saved side wins (`App.options` in Supervisor's `apps/app.py`). Every value above is a
  default, so updating to 0.3.3 changes nothing for an installation whose 구성 form has ever
  been saved. Those installations have to be edited on the panel itself — in particular
  `tx_observation_timeout_ms`, which is 4,600 ms here but stays at whatever was stored.

### Internal

- `test/addon-defaults.test.ts` checks the shipped defaults against something for the first
  time: every default inside its own schema bounds, the observation window equal to the
  constant that carries its reasoning, the three capture limits consistent at the bus rate
  derived from `DEVICE_POLL_MS`, and `config.json` in agreement with the parser's fallbacks.
  The suites all built their own settings objects, so none of this was covered.
- The release version is now read from `bestium-eco-foret/config.json` rather than restated in
  `test/m2.test.ts`.

## [0.3.2] - 2026-08-31

### Fixed

- Control stopped working a few minutes after the add-on started unless a capture had been
  run. `onData` kept the capture file's accounting — the byte count, the record count, the
  preview — running whether or not a recording was open. 0.3.0 guarded `queueRecord`, which is
  where the file is written, and left everything above it untouched, so a link that had never
  recorded anything still counted its way to `maximum_records` and then called the same finish
  path a real capture uses. That closed the link, and with it the page's control. On this bus
  1,000 reads is about four minutes.

  Starting and stopping a capture reset the counters, which is why control came back
  afterwards and looked like the split working. It was buying another four minutes.

- A link that dropped never came back. `onClose`, `onError` and `onConnectTimeout` all ended
  the link for good. That was right when the link belonged to a capture — a capture is a
  finite job and losing the line ends it — but a link lives as long as the page does. A
  gateway that reboots, a network that blinks, or an EW11 that is not answering yet in the
  three seconds after Home Assistant starts the add-on would each leave the page dead until
  someone restarted it. All three now relink, with waits that escalate to thirty seconds so a
  gateway that is down does not become a reconnect loop.

  The recording still ends when the link drops. Frames were lost, and a capture file with an
  invisible hole in it is worse than a short one.

  The capture's own limits — `capture_duration_ms`, `maximum_bytes`, `maximum_records` — now
  end only the file. A link that closed itself after `capture_duration_ms` would take the
  page's control with it, which is the same defect by another road.

## [0.3.1] - 2026-08-31

### Fixed

- The add-on could not start. 0.3.0's image was missing `src/ha-design-system.ts` and
  `src/tx-queue.ts`, so `node src/m2.ts` died at import with `Cannot find module`. The
  Dockerfile named each module it copied, and a list has to be edited every time a module is
  added — twice it was not. `tx-queue.ts` had been absent from the image since the day it was
  written; nothing noticed because that version was never deployed. The image copies the whole
  source directory now, and three tests hold it: every module reachable from the entry point is
  in the image, every module in the source is reachable from the entry point, and the image's
  version label matches the add-on's own.

  The tests run against the repository and the add-on runs from an image, and nothing had ever
  compared the two. A green suite and an add-on that will not start were possible at the same
  time.

## [0.3.0] - 2026-08-30

### Changed

- **The page controls without a capture running.** One `coordinator.start()` opened the recording
  file and the TCP socket in the same call, so nothing decoded and nothing sent until an operator
  started a capture — the send gate carried `capture is not running` as a literal reason. The two
  lifecycles are separate now. The link is the socket, the decoder and the generation counter; the
  add-on opens it at startup and keeps it open. The recording is the capture file, which the
  operator starts and stops on top of it. The send reason is `gateway link is not up`.

- **The page is a product screen rather than a debug console.** Five cards on one scrolling screen:
  a send banner in six states, lights, heating, the common-area devices, and the capture card below
  a rule. Gone with the tabs: the frame log, the query-only device panel, the ambiguous-frame panel,
  the arbitrary-send lab, the two-activation review flow, the candidate tier and the doorbell
  banner. The styling is the Home Assistant design system merged from its own sources rather than a
  hand-summarised subset, which is how the page and the design drifted apart before.

- **The action contract says what the bus does.** The lights and the heating each gained a group
  command at address `0x10` — one frame, not four; 0.2.7 expanded all-zones-off into four per-zone
  frames on the reasoning that no group command existed, which was an argument from absence. The
  elevator call moved to the shape that registered: kind byte `0x04` with the direction last, two
  bytes away from the one that went out twice and moved nothing. Batch-off is new, and `raw`,
  `outlet` and `ventilation` are gone — this wallpad has neither module, and arbitrary sends belong
  to the local buslab behind its allow-list.

- **Confirmation waits for the poll it is actually watching for.** A direct reply says nothing about
  the effect: the gas valve answers byte-identically whether or not the state changed, a heating
  zone echoed a target it did not adopt, and a group command draws no direct reply at all. The
  window is two polls of the slowest device (4,600 ms) rather than 3,000 ms, which held exactly one
  2,300 ms heating poll — so a poll running late closed the window and the frame went out again.

### Fixed

- Batch-off could be queued but never confirmed: `0x2A` was still being pushed to the ambiguous
  list, so `devices.batchOff` did not exist and the queue would have retried the write to the end
  of its budget while the page reported 미관측 for a write that worked. On a switch that kills
  lights in rooms the wallpad cannot reach, a needless repeat is the wrong way to fail.

- The elevator reported a `motion` field the bus never carries. The high nibble is the direction the
  car is going *or about to go* — actual motion while travelling, service direction while standing —
  so `heading` says what it means and nothing claims to know the car is moving.

- A door opening was a flag that went true and stayed true, which reads as "a door is open"; nothing
  on this line reports a door closing. It is an event with a time now, and the three frames one
  press puts on the line fold into one.

- Three defects that only a browser found: the banner sat under a warning triangle while saying the
  controls were ready, the observation meter rendered on a page that was not sending because
  `display:flex` beats the hidden attribute, and every 끄기 took the brand colour as though off
  were the thing being done.

### 이번 판에 함께 들어간 앞선 작업

### Fixed

- Two `tools/buslab` defects that only a live run could expose, with evidence row `M4-E128`. The
  control socket sat beside the run inside the repository, whose path is 105 bytes for an ordinary
  run name against the 104 macOS allows in a unix socket address, so `listen` failed with `EINVAL`;
  the unit tests never saw it because `mkdtemp` gives short paths. It now lives under a digest of
  the run's path in the per-user temporary directory. And `around` compared the baseline against
  only the first frame in its window, while the wallpad's status poll runs every 2.2 s so the poll
  immediately after a write still carries the old state; the first live change was reported as no
  change. It now reports the first frame that actually differs.

### Added

- A guarded send path for `tools/buslab`, `M4.12` Epic E3, with evidence row `M4-E127`. Without
  `--arm` nothing reaches the bus. With it, the phase-one allowlist is the six light frames matched
  byte for byte rather than by pattern, because a mistyped XOR that satisfied a pattern would leave
  the wallpad ignoring the frame and the tool recording a silence that means nothing. Three refusals
  are not a phase and no flag opens them: the `0x7F` subphone macros, which open a door; the
  `0x1E` `0x02` frame, whose meaning is undecided; and any gas frame that is not the close. A send
  waits for the line to fall quiet, records the gap it actually got, and reports a matching frame as
  `direct` within 150 ms or `polling` after it, alongside how long since that frame last appeared
  before the write — because the wallpad polls every two seconds and "arrived in the window" is not
  the same claim as "arrived because of us". Every latency is an upper bound and says so: the write
  callback reaches only the kernel buffer and the gateway holds each direction for its 50 ms flush.
  One send at a time; a second while one is in flight is refused. `encode.ts` builds frames from the
  frame rule and prints the add-on's encoder beside its own, which already disagrees on all-zones-off.

- An independent framer and offline analysis for `tools/buslab`, `M4.12` Epic E2, with evidence
  row `M4-E126`. The framer knows a length byte, an XOR over all but the last two bytes, and the
  terminator `EE`, and imports nothing from the add-on, so when the two agree the agreement is
  evidence rather than a tautology. Against the 54.6-minute capture the add-on took it finds
  21,095 frames and leaves zero of 350,203 bytes unexplained. Carrying across reads is what makes
  that possible: the fourteen bytes an earlier per-read count called garbage are one frame split
  between two reads. `buslab frames`, `inventory` and `around` read a finished run or any add-on
  capture and touch no network. They group frames by the tuple that says what a frame is about
  and give it no name, because discovery has to work before a name exists, and they compare
  frames only within one length, because a tuple arrives in several shapes and lining those up by
  position puts a payload byte against a checksum byte. `around` recovered the all-lights-off
  frame from the capture with no hint beyond a timestamp.

- `tools/buslab`, the local measurement tool of `M4.12` Epic E1, with evidence row `M4-E125`.
  A daemon holds one TCP connection to the gateway from this machine, records every read
  verbatim with a wall clock and a monotonic clock, and takes `status`, `mark` and `stop` over
  a unix control socket so a session can drive it one command at a time. It has no dependency
  and imports nothing from the add-on. Three properties are deliberate: a read is recorded as
  it arrived rather than reassembled, because a TCP boundary is not a frame boundary; nothing
  pauses the socket to let the writer keep up, because that distorts the timing being measured,
  so a `backlog` record says so instead; and every timestamp is taken in the daemon, because
  `process.hrtime.bigint()` counts from a per-process origin. Sending is not implemented and
  cannot be: that is Epic E3. The gateway address stays out of the repository and out of every
  artifact.

### Fixed

- `stop` over the control socket now ends the process, with evidence row `M4-E138`. It stopped the
  run and dropped the gateway socket but left the process alive holding its control socket until
  the `--seconds` timer or a signal: the operator saw `{"ok":true,"reason":"stopped"}` and a
  process still running ten minutes later. `createControlHandler` now asks the process to end after
  a stop the daemon accepted, after the reply exists so the caller is still answered; a refusal or
  a throw leaves it alone, because ending a run over a request that changed nothing would be worse
  than the leak.

### Documentation

- Measure the heating target range end to end, with evidence row `M4-E151`. The operator raised the
  tool's ceiling from 23 to 40 to allow it. Seventeen armed sends, answered in 99 to 115 ms,
  1,051 frames with zero corrupt bytes, sixteen confirmed by the poll. **5 and 40 apply in every
  zone** and 23 restored each time.

  **The device enforces the bottom of the range itself, and the reply lies about it.** A 4 °C write
  came back with `04` echoed in the direct reply while the poll's target stayed at 23. The write was
  not ignored: 2.2 s later the zone's state went from off to on with the target unchanged, so the
  command is partly applied — the enable is taken and the value discarded. This is the sharpest case
  yet for judging by the poll. Gas gave a reply that was merely identical in both outcomes; here the
  reply carries a number the device refused to adopt, and an implementation trusting it would report
  a 4 °C target that does not exist.

  The 34 values between the ends were left unmeasured on purpose: the same frame with a different
  byte, at the cost of gas. 40 °C in rooms at 24 to 27 is real demand and writing a target switches
  its zone on, so each zone burned for about three seconds — one poll period — before 23 took it
  back. The house is verified at its baseline afterwards.

  Whether the device would also reject 41 is unknown by choice: the tool refuses it.

- Call the elevator from this line and watch it come, with evidence row `M4-E150`. Phase eight
  carries both legacy skeletons and their revokes; five armed sends, 2,252 frames, zero corrupt
  bytes. **Variant 1's up frame works**: `f70b0134044110000599ee` registered as `05` 1,582 ms later
  and the car arrived 15.5 s after that. `matchingFrameAgoMs` is `None` on every call send, so the
  one that worked is not a poll landing in a window.

  This also settles the high nibble. The car was at floor 7 — above the calling floor, answering an
  up call, which is exactly the discriminating case the previous run could not produce. It
  descended as `b5` and then held at floor 4 as `a5`. So the nibble is the direction the car is
  going **or about to go**: actual motion while travelling, service direction while stopped at the
  destination. The legacy's "moving upside/downside" is right only for the travelling half.

  **The first round's "no response" verdicts were partly the mask's doing.**
  `--expect f70d01340141100006` demands the state byte be exactly `06`, and a registering call skips
  that: `a6` if the car is already moving, `01` if it is already on this floor. A prefix mask cannot
  ask for "low nibble 6". Re-judged from the state stream, **variant 1 works in both directions** —
  three registrations out of the four sends that can be judged, at 1,582, 1,588 and 1,838 ms — and
  only one send genuinely drew nothing. Variant 0 drew nothing on either of its two sends, against
  a legacy default of 0, which is a real contrast on thin numbers.

  A later call caught the car in the basement: the floor field read **`b1`**, confirming the
  legacy's string encoding for basements and closing that gap. That journey took 39.2 s.

  **The revoke was sent three times and tested none of them**: twice the call had already finished,
  once nothing was pending. With the car parked on this floor a call resolves inside two seconds
  and leaves no gap to cancel in, and we cannot arrange for it to be far away. Stopped there rather
  than keep calling a shared lift.

- Measure the elevator by listening, with evidence rows `M4-E148` and `M4-E149`. **On this bus the
  elevator is read-only.** The operator pressed the hallway call button and nothing changed
  anywhere on the line — 89 elevator frames all idle, twelve distinct frames in the whole window,
  every one routine. Pressing the wallpad's own down button changed the state within two seconds,
  and a byte-level sweep of the three seconds around it shows only routine polling: **no command
  left the wallpad on this line at all.** Across 44,986 frames `0x34` is `kind=01` 4,224 times and
  `kind=02` and `kind=04` zero times.

  So the wallpad calls the elevator by some other path and relays only the result, which is what
  the legacy's own annotation says — this frame runs wallpad to hallway mini-pad.

  That hallway call **worked**: the operator says it brought the car to this floor, which is why
  the wallpad call two minutes later finished in two seconds. The elevator was moving while this
  line stayed silent, so the reading is stronger than a bare negative — the line does not report
  calls raised from the hallway, and an add-on can only see the ones the wallpad itself makes.

  It does not follow that the line cannot carry a call. The operator reports that the legacy
  add-on's elevator call did work here, which is direct evidence that it can; the absence is the
  wallpad's choice of path, not the frame's viability. The legacy's `packet_call_type` defaults to
  0 and so does the add-on's setting, so the frame that worked is variant 0 — the same skeleton the
  current add-on builds.

  All four states are now watched live. A second call, with the car at floor 1, gave a whole
  journey: `06` at floor 1, `a6` rising, the floor jumping 1 to 3 to 4 because the car outruns the
  1.3 to 2.0 s frame period, then `b6`, then `01` and idle. Registration to arrival was 15.0 s
  against the earlier up call's 14.8 s, and the return to idle 1.9 s in both.

  **The legacy's reading of the high nibble is falsified.** It reads it as the direction the car is
  moving. A third call, up this time, settles it: held at floor 4 in the same place in the sequence,
  a down call reads `b6` for eight seconds and an up call reads `a5` for seven. Same physical
  state, different value — the nibble tracks the call, not the motion. It is the direction the car
  is going **or about to go**, which also explains `a5` sitting at floor 1 for 21 seconds with the
  floor unchanged.

  Two consequences for anything built on this. **The nibble never falls to `0` while a call is
  live**, so a state machine must not read "stopped" from it; the only real stops are `00` idle and
  `01` arrived. And the timings do not repeat: registration to arrival was 14.8, 15.0 and 37.0 s
  across the three calls, while arrival to idle was 1.9 s in all three. A timeout belongs on the
  first, sized for the worst.

  **The car field cannot mean what the legacy says.** It reads `0b` every time and the building has
  one elevator, so an nth-car index cannot be right; it is not a meaningless constant either, since
  it drops to `00` when idle. What it means is unknown.

- Close gas over the bus and watch the transition both ways, with evidence rows `M4-E146` and
  `M4-E147`. Stage B ran with the operator opening the valve by hand before and after. The valve
  read `04` in sixteen polls, the close answered in 118 ms, and the first poll carrying `03` came
  at 1,518 ms; the operator's reopen gave the return leg.

  **The direct reply cannot tell whether the command did anything.** Stage A's reply, where nothing
  changed, and stage B's, where the valve actually shut, are byte-identical. The reply says the
  command was received; only the poll says it had an effect. The criterion the lights and heating
  settled on is therefore necessary here, not merely prudent.

  **`0x2A` carries two devices' states, not one.** Its reply is
  `F7 0E 01 2A 04 40 10 00 19 <light batch-off> 1B <gas> <XOR> EE`: byte 8 is the light device's
  address and byte 10 the gas device's, each followed by that device's state. All 268 replies on
  record have byte 11 equal to the `0x1B` state at that moment, and it followed the valve in both
  directions with a lag of 1,470 to 1,758 ms — this device's own polling period. `M4-E134` recorded
  those trailing bytes as never moving, which was an artefact of the valve staying shut for that
  whole run rather than a property of the frame; the row is corrected. This is why the legacy calls
  it a multi function switch, and it fits an entrance panel carrying batch-off and gas together.

  The `1B` pair has no tested set frame and was not derived: the legacy builds only the `19`
  variant, and gas is already controllable through `0x1B` directly.

- Measure gas closing without touching the valve, with evidence row `M4-E145`. Phase seven carries
  one frame, and stage A of the gas scenario sends it while the valve is already shut, so nothing
  could change. It answered in 127 ms, and the reply is byte-identical to the single one in
  `capture-1788009200284` that the wallpad's own command drew — the frame and its answer are now
  confirmed from two independent directions. `matchingFrameAgoMs` is `None`, so this is a real
  answer and not a poll landing in the window the way the `0x2A` release was.

  **A device answers a command for the state it already holds.** The add-on's confirm-by-state-match
  leans on that, and it had never been checked on gas. The direct-reply shape
  `F7 0B 01 1B 04 43 11 <value> <state> <XOR> EE` was missing from the specification and is added,
  along with the full inventory: five distinct `0x1B` frames in 41,504.

  Opening is refused at every phase and under `allow-all`, asserted across six values rather than
  only `04`, and the mutation that weakens the refusal to `04` alone is caught. No state transition
  was observed; that is stage B, and it needs the valve opened by hand and opened again afterwards.
  The operator confirms it feeds the kitchen only.

- **`0x2A` does have a set command**, with evidence rows `M4-E143` and `M4-E144`. This project's
  own claim that it had none is falsified. The legacy implementation carries the frames, read under
  the AGENTS.md clause that permits the legacy source for protocol specification, and both work:
  `f70c012a0240110119009bee` engages and `f70c012a02401102190098ee` releases, each answered
  directly in 133 and 130 ms.

  Sending it reproduces the entrance switch's whole chain. After the engage the device answers at
  +133 ms, the wallpad's routine poll reads the new state at +1,473 ms, and the wallpad emits the
  light group-off frame at +1,546 ms — 73 ms after that poll. That is the causal model `M4-E134`
  built from watching the switch, with us pulling the first link.

  The derived candidates of `M4-E142` failed because a set frame need not use the address its query
  uses. The rule was already visible in the lights, where `10` is the group and `11` to `13` the
  lamps, and heating repeats it; `0x2A` is queried at `10` and set at `11`. Two further errors rode
  along: the length came from the light frame rather than this device's own shape, and the `19 00`
  payload was dropped. A device's set frame is built from its **own** reply.

  `M4-E140` still stands and is a different direction: commanding `0x2A` moves the lights,
  commanding the lights does not move `0x2A`.

  What the run cannot show is whether the other rooms actually went dark. The wallpad reports only
  its three lamps and no other light device appears on this line, so only a person in the house can
  say. That matters because the operator says the wallpad cannot reach those rooms at all, which
  makes this device the only path to a whole-house off — and means the `0x19` group frame was never
  one, whatever an earlier summary in this session said.

- Measure the per-zone heating target and test the batch-off device, with evidence rows `M4-E141`
  and `M4-E142`. Phase five opens `0x45` for zones 2 to 4 at the two values zone 1 used, and two
  derived `0x2A` set candidates. Eleven armed sends, 1,362 frames over 214 s, zero corrupt bytes.

  **All four zones take an individual target**, confirmed by direct reply in 99 to 110 ms and by
  the poll. Every one of the six target writes carries state `01`, so the effect first seen on zone
  1 holds in every zone: writing a target switches its zone on. The zone-dependent reading is dead;
  the temperature confound is not, since all eight values were below the room and separating them
  needs a target above it, which means real heating demand.

  **The derived `0x2A` set frames do not work.** The operator was right that "there is no command
  to send" was an argument from absence, and asked for it to be tried. Both candidates went out
  through the gate and were ignored: all 111 `0x2A` replies in the run are one identical frame, the
  lights never moved, and the 1.5 s after the engage carried only routine polling with nothing to
  or from that device. This is a negative on one shape, not a proof that no set command exists —
  the fourteen-byte skeleton the reply itself uses, other sub-commands and other addresses are
  untried. It carries weight because the heating group-on frame, derived the same way and equally
  unobserved, worked on its first send.

  The release send reported a reply at 399 ms. It is a false positive: `0x2A` already held the
  value the mask was written for, and the record's own `matchingFrameAgoMs` of 1,504 ms says a
  matching frame preceded the write. The fault was taking the engage's success as the premise for
  the release's mask, which a chained test must not do.

  The batch-off switch is at the front door, not on the wallpad. Corrected wherever it was recorded.

- Measure the heating group frames, with evidence rows `M4-E139` and `M4-E140`. Phase four of the
  `buslab` allowlist opens `0x18 02 46 10`, which addresses all four zones at once. Six armed sends
  through the gate, all six confirmed by the poll, 989 frames over 155 s with zero corrupt bytes.

  **The group-on frame works, and it had never been observed anywhere.** `f70b01180246100100b0ee`
  appears in neither capture nor the legacy source; it took `04040404` to `01010101`, and the
  group-off frame watched twice on the bus took it back. The ledger grades them apart: one is
  confirmed by observation, the other only by our own send.

  **Neither draws a direct reply.** Across the run the only `0x18` frames are the query and the
  full poll — no third shape at any length — where a per-zone command answers in 100 ms with
  eighteen bytes. What arrives instead is an unscheduled full poll carrying the new state, 161 and
  162 ms after the write against a 2,050 ms median period; exactly two of 67 poll intervals fall
  under a second and both follow these sends, while the same run's four light sends produce none.
  A confirmation window has to treat group and per-zone differently.

  **`0x2A` did not move.** The light group-off frame is the one that flows when the entrance
  batch-off switch engages, and sending it ourselves left byte 9 at `02` in all 91 replies. That is
  what the `M4-E134` decode predicted, so the desynchronisation concern withdrawn there is now
  actively falsified rather than merely retracted. It cuts both ways: turning every light off over
  the bus leaves the wallpad's batch-off indicator released, so the two states can diverge.

  The light group frames also rise from reply-confirmed to poll-confirmed in the same run, and the
  lights were returned to the state the run found them in.

- Measure heating on the live bus, with evidence rows `M4-E136` and `M4-E137`. Phase three of the
  `buslab` allowlist opens the eight zone on/off frames and two zone 1 target frames; 22 armed
  sends went out through the silent-query gate with no `no_gate_window`, and 1,825 frames over
  285 s carry zero corrupt bytes. The tool matched 20 of the 22 replies: the two it missed are the
  first pass's target sends, whose answers arrived 100 ms later and are in the frame record, but
  the mask put `00` where the reply carries its state. 20 of 22 is what the tool can claim for
  itself; 22 of 22 is what happened on the wire. Every one of the eleven sends in the second pass is confirmed by the wallpad's
  own poll rather than only by its reply. **Zones 2 to 4 off rise from rule-derived to observed.**

  The gate is therefore not a light-only result. `quietWaitedMs` was 0 on all 22, so it removes the
  wait rather than shortening it, and all four silent devices opened windows. Heating's 74-byte full
  reply is the largest frame on this line, and no gate-opening query was followed by one inside
  300 ms in 260 windows.

  **Writing a target to an off zone left it on, both times.** Zone 1 was off, received 21 °C and
  then 23 °C, and both replies carried state `01` with the poll agreeing. A restore must put the
  target back and then turn the zone off, in that order; the first pass did only the former and
  left the zone on, which the poll caught. It is not promoted to a rule: both values were below the
  room's 24 °C, so "writing a target enables the zone" and "writing a target below the room enables
  it" both fit, and those are different defects with different fixes. Either way `protocol-debug.ts`
  builds only the `0x45` frame for a `temperatureC` action and models no such effect. A defect
  report against the add-on, not yet a fix.

  The safety argument for arming at all is a fact about August: every room read 24 °C or warmer
  against a 23 °C target, so nothing sent could call for heat. The guard's ceiling stops the tool
  raising a target and cannot stop a zone turned on at the existing target from heating a room that
  has since cooled, so the caller reads the temperatures first. The house was verified back at its
  baseline before the run closed.

- Redact the gateway address from the ledger, with evidence row `M4-E135`. It was written by hand
  into five cells of `.agent/progress.md`. The `buslab` redactor had done its job — no run artifact
  and no untracked file carries the literal — so every occurrence came from prose. Four sit in the
  unpushed M4.12 commits; the fifth entered during M3 and is on the public remote already, which a
  redaction here does not undo. The sweep found no other private address, and neither the admin
  password nor the WiFi key from the EW11 backup is anywhere in the repository.

- Decode the batch-off device `0x2A`, with evidence row `M4-E134`. The specification left it
  `ambiguous`; the operator pressed the entrance switch four times while the tool listened.
  **`0x2A` has no command of its own.** It reports a state — byte 9 of its reply, `01` engaged and
  `02` released — and the button acts entirely through the light device. Engaging sends the group-off
  frame we already had; releasing sends light 1 on. The reply carrying the new state always arrives
  *before* the light command, by 84, 186, 192 and 200 ms.

  Those figures are not the interval between the state changing and the command. `0x2A` is polled
  uniformly — 453 replies in 12.5 minutes, median interval 1,860 ms, and not one of the 452 intervals
  under 250 ms — so the change itself can precede its own report by up to about 1.9 s. Only the
  ordering is established. What the narrow 84–200 ms band does suggest is the mechanism: against a
  1.86 s polling period, a command landing within 0.2 s of the reporting reply four times out of
  four reads as the wallpad acting on what it just polled. That is a hypothesis on four samples.

  The release is not a restore. It looked like one that had lost part of its memory, and the guess
  was that a group frame fails to update what the wallpad remembers. Rebuilding the state with
  individual frames only falsified it: with all three lit beforehand the release gave light 1 alone,
  and with light 1 dark and the others lit it gave light 1 alone again. Light 1's prior state was
  opposite in the two cases and the outcome identical. The concern recorded minutes earlier — that
  group frames could desynchronise the wall button — is therefore withdrawn.

  The wallpad still has never been seen sending the group-**on** frame. That one remains ours,
  derived from the address rule and confirmed only by our own sends, and the two are graded apart.

- Confirm all eight light frames through the gate rather than the two the earlier result rested
  on, with evidence row `M4-E133`. Counting what had actually been sent showed the 40/40 was Light 1
  on and off alone: Light 2 had never been sent, Light 3 only its on frame, and each group frame
  once or twice under the old quiet window. Twenty further sends, ordered so every command demanded
  a real state change, were answered 20/20 and reached the state 20/20 with zero corrupt bytes.
  Across every gated run: 109 sends, 109 answered, zero corrupt bytes in 2,320 frames, against 138
  of 183 answered and 1,033 corrupt bytes for the quiet-window runs of the same tool. `0x2A`, the
  batch-off device, remains untouched: it is separate from the `0x19` group address and no set frame
  for it exists in either capture.

- Find that the lost sends are collisions after all, and gate the write on the moment the
  wallpad reserves for a query nobody answers, with evidence rows `M4-E131` and `M4-E132`. Pooling
  every write ever sent shows it: 62 % of unanswered writes had corruption on the bus within
  400 ms against 9 % of answered ones, and the next frame after an unanswered write arrived at a
  median of 56 ms and was usually the wallpad's next query. The achieved quiet window fails to
  predict this not because collision is absent but because the gateway's 50 ms `Gap Time` makes
  every idle judgement 50 ms stale, so a wallpad about to transmit is invisible. Four devices
  never answer their query and the wallpad then waits about 270 ms: 7,019 such windows in the
  capture, where an eleven-byte frame fits every time against 42 % for a 60 ms quiet window.
  Through that gate, two blocks of twenty sends were answered 20/20 and 20/20 with **zero corrupt
  bytes**, against 15/20 and 66 corrupt bytes per thousand frames under the quiet window.

  This supersedes the retry-first conclusion recorded a few hours earlier; the analysis is
  corrected in place rather than left standing. Retry remains as a net, and because collision is
  the cause, more attempts mean more damage to the wallpad's own traffic.

  Changing the gateway's `Flow Control` to `Half Duplex` was tried and reverted: 16/20 answered,
  indistinguishable from the baseline, and more corruption rather than less.

- Stop the framer turning corruption into frames, with evidence row `M4-E132`. Any byte equal to
  `0x7F` began a five-byte frame with nothing checked, and `0x7F` has never appeared on this line
  at all. Nine such frames were fabricated from live corruption and one of them consumed the
  opening three bytes of a valid frame. The repair checks the `7F <header> 00 00 EE` fixed fields
  rather than the eight documented headers, so a ninth header would still parse, and it raised one
  run's corruption count from 31 to 46 bytes — which is how much the defect had been hiding.

- Record the first live measurement in `.agent/analysis-live-light-measurement.md`, with evidence
  rows `M4-E129` and `M4-E130`, and add an explicit phase-two allowlist to `tools/buslab` for the
  two light group frames. Sixty-five frames reached the wallpad, all of them lights.

  The question `M4-E117` left open is answered: **the residual failure is not the quiet window.**
  Across forty writes the failure rate does not follow the silence achieved — 1 of 5 below 60 ms,
  3 of 15 at 60-100, 2 of 12 at 100-200, 3 of 8 above 200 — and the unanswered writes had a
  *higher* median quiet window than the answered ones. Widening `tx_quiet_ms` cannot fix it.

  What the quiet window does change is the damage. Observation alone produced zero corrupt bytes
  in 253 reads; sending produced 31 at `quiet_ms` 60 and 160 at 30, and nearly all of it lands
  within -20 to +300 ms of one of our writes, so our transmission is what destroys the wallpad's
  own frames. `tx_quiet_ms` stays at 60 for that reason and not for ours.

  The direct reply is a reliable confirmation: in twenty judged commands every answered one took
  effect, including three no-ops, and every unanswered state-changing one failed. That is the
  design `0.3.0` already ships — a match rather than a change, and bounded retry — and this
  measurement is what supports it.

  `F7 0B 01 19 02 40 10 01 00 B7 EE` turns all three lights on. It appears in no capture and was
  derived from the group-address rule; the wallpad answered it and the status went `020202` to
  `010101`. The all-off frame was confirmed from a genuinely on state. No frame encoding a subset
  was sent, because none has been observed; a subset is built from individual frames instead, which
  is how Lights 1 and 3 were left on with Light 2 off.

- Record what the EW11's own settings page and a fresh 54.6-minute capture establish, in
  `.agent/analysis-ew11-timing-and-group-frames.md`, with evidence row `M4-E124`. `Gap Time`
  is 50 ms, so the gateway forwards serial bytes only after the line has been quiet that long;
  a TCP read arriving at `T` describes a wire that fell silent near `T - 50`, which is the size
  of the error `M4-E111` recorded without a number, and it is why one read in five carries more
  than one frame. A parser that imports no product code and knows only length, XOR and `EE`
  returned 21,094 frames and left 14 bytes of 350,203, so the framer for `M4.12` now has an
  external answer to reproduce. The capture also carries two frames the specification said did
  not exist: `F7 0B 01 19 02 40 10 02 00 B4 EE` turns all three lights off and
  `F7 0B 01 18 02 46 10 04 00 B5 EE` turns all four heating zones off, each in one frame, both
  confirmed by the state replies that follow. `.agent/spec-device-protocol.md` claimed that
  neither the bus nor the legacy implementation has a batch heating command; that claim is
  corrected. Seven encoder frames and the gas close frame are byte-identical to the wallpad's
  own. No product code, test or configuration changed in this unit, and the falsified comment
  at `protocol-debug.ts:551` is recorded rather than edited, because a frame watched on the bus
  is not yet a frame we have sent.
- Repair three documents that had gone stale, with evidence row `M4-E123`. The resume
  procedure in `.agent/progress.md` told a resumed session to verify a HEAD subject, a parent
  and an ahead-count from M4.5, so following it verbatim reported a failure that was not
  there; it now identifies HEAD by subject and every other position by SHA, and names both
  the commit that moves HEAD and the push that moves `origin/main` as the events that must
  rewrite it. The checkpoint's Next event line asked for a Home Assistant update of `0.2.8`
  at `18bf6d2` when what waits is `0.3.0` at `8af41c8`. Two changelog entries describing
  `.agent/analysis-0.2.8-field-report.md` and `.agent/plan-0.3.0.md` sat under Unreleased,
  though `git log` shows both files entered the tree in `8af41c8`, the same commit as
  `[0.3.0]`; they are moved under that release. No product code, test or configuration
  changed in this unit.
- Record the `M4.12` design for a local measurement tool in `.agent/plan-buslab.md`, with
  evidence row `M4-E122`. The add-on's capture can never pair a command with its reply, because
  our own writes are not echoed on this line; a tool that holds its own connection from the
  development machine records both in one log on one clock and can. The EW11 accepts five
  simultaneous clients and Home Assistant is switched off, so the tool is the only writer on the
  bus. The tool carries its own framer that reads only length, XOR and `EE`, and prints the
  product encoder's bytes beside its own, so the self-confirming loop `.agent/spec-device-protocol.md`
  §3.1 names is broken rather than repeated. Recording the idle gap achieved on every write is what
  closes the residual-failure question `M4-E117` left open. Transmission is limited to the six light
  frames by exact byte match; the `0x7F` macros, the `0x1E` `0x02` frame and gas open are refused by a
  list no flag opens. An adversarial self-reading of the plan found and repaired five defects,
  including monotonic timestamps compared across two processes. No product code, test or
  configuration changed in this unit, and the plan's live phase is gated on a separate instruction.

### 2026-08-25에 준비되었던 0.3.0 항목

The operator raised `tx_quiet_ms` to 60 ms on the live bus and every control confirmed —
lights, gas and all four heating zones. That closed the collision attribution by
intervention and met the condition 0.2.7 set for promoting heating. What remained was that
one frame can be on the line at a time, so a second press was refused outright and a frame
lost to a collision was never sent again.

### Added

- A send queue keyed by the settable an action addresses: `light:2`, `heat:3:power`,
  `heat:3:target`, `gas`, `elevator`. Re-pressing a control replaces its queued value and
  keeps its place, so repeats collapse to one execution carrying the last state asked for
  while a different device queues behind rather than being refused. The key space bounds the
  queue at fourteen entries, so no length limit is needed. Pressing one light on, off, on,
  off now puts two frames on the bus — the one already in flight, which cannot be recalled,
  and the last state asked for — instead of one frame and three refusals.
- Retry until the device is observed holding the value that was asked for, bounded by the
  new `tx_max_attempts` (default 3, range 1–10). Only a refusal a later attempt could clear
  is retried; a disabled flag or a mismatched user is returned at once.
- Outcomes the operator can act on: `confirmed`, `unconfirmed`, `superseded`. A tap that is
  refused now always says which gate refused it.
- The page shows what is waiting to be sent.
- `motion` and `call` are decoded separately for the elevator, and a `floorLabel` renders
  the floor byte.

### Changed

- A queued control no longer opens the review card. That card is single-instance for the
  whole document, so holding it refused the second press of a control before it could reach
  the queue that exists to coalesce it. The card is now what the elevator call and the raw
  lab use, which is what it was for. The client-side observation lease that went with it is
  removed: the server confirms, so the page had a second, weaker copy of the same job that
  nothing could reach.
- The ingress no longer runs a queued command through the mutation chain. The send queue is
  the serialiser for what it owns, and putting the chain in front of it made coalescing
  unreachable. Capture start and stop still refuse while a live command is outstanding, so
  the invariant the chain protected holds without it.
- Success is the addressed field matching the intent in an observation stamped after the
  write — a match, never a change. Both heating commands of ours that reached the bus in
  capture A were no-ops against the state the zone already held, and the wallpad answered
  both; requiring a change would have retried them until the budget ran out. Each intent
  reads only the field it owns, because the wallpad answers `0x45` and `0x46` alike with the
  whole zone.
- All-zones off is four independent per-zone intents rather than one macro, each queued,
  retried and confirmed on its own. The wallpad sends it that way too.
- Heating on/off and target temperature on all four zones, and gas close, are `observed`.
  One tap sends them.
- `tx_quiet_ms` defaults to 60 ms. Twenty was shorter than the roughly 12 ms an eleven-byte
  frame occupies at 9600 baud, so a send could start into the wallpad's next frame.
- `speculative_tx_cooldown_ms` no longer applies to a queued control, because coalescing
  does that work. It is kept in the schema and still gates issuing a candidate challenge,
  so an existing installation's saved options stay valid.

### Fixed

- The pre-write race check compared against a snapshot taken *before* the quiet wait, so
  waiting for the line — the whole point of the 0.2.8 change — could by itself refuse the
  write. Inbound counters advance on every received byte and on every capture append, and
  every one of the operator's tests ran with a capture active. The baseline is now taken
  Only `externalTxByteEpoch` and `externalTailHash` are compared now, and they are still
  compared against the pre-wait snapshot: an independent review caught a first cut of this
  repair that moved the baseline after the wait as well, which left every field being
  compared with itself and a check that could only ever fire on a pending capture append.
- Confirmation was anchored to the moment an attempt began rather than to the write, so every
  frame arriving during a quiet wait of up to a second counted as an observation made after
  it. It is anchored to the write now.
- A frame that reached the bus could be reported as never sent: only the last attempt's
  outcome survived, so a first attempt that wrote followed by two refusals read as "not sent"
  and invited the operator to press again. Any attempt that wrote now forces an unconfirmed
  result, and the frame count is reported.
- An all-zones batch collapsed to its first non-confirmed part, so one refused zone reported
  the whole batch as not sent while three zones had already acted. It reports per zone now.
- The elevator's confirmation matched the standing call, which is a shared building state: a
  call already waiting in that direction, or a neighbour's, satisfied it. For that one
  control the predicate is a change, since obtaining a verdict is the entire purpose.
- A request that was going to be refused could take a queue slot and evict the legitimate
  intent waiting on that control. Authorisation is checked before enqueue.
- The elevator's second legacy frame shape was built and returned but no code path could ever
  send it. It is removed; the shape stays documented in the protocol spec.
- `oneTapSend` returned with no message when the page was locked or busy, so every tap
  after one indeterminate write left no trace. That is what the operator read as an
  unresponsive button.
- The elevator's standing call was folded into `direction` and disappeared whenever the car
  was moving: `0xA5` is "ascending with an up call waiting" and read as plain "up".
- The floor byte was rendered raw, so a car in the basement read as **177**.
- The `0x1E` `0x02` frame was reported as a call in progress. It appears three times in a
  row at the instant the wallpad's door-open button is pressed, and nothing on this line
  moves when the bell is rung, so the page said the opposite of what happened. It is now
  reported as the door-open operation it was observed alongside. Whether it is the command
  itself or the notice that the call ended is still undecided and it is not wired to any
  send control.
- The communal entrance no longer shows an initial value as though it were an observation.
  Every one of its poll frames is byte-identical across all three captures.

### Documentation

- Record the field analysis of the two `0.2.8` captures in
  `.agent/analysis-0.2.8-field-report.md`, with evidence rows `M4-E115` and `M4-E116`.
  The heating encoder reproduces the wallpad's own frames byte for byte, so the reported
  heating failure is above the wire; the wallpad's own elevator call puts no set frame on
  this line; the `0x1E` `0x02` triple is coincident with the operator's door-open press but
  is not yet distinguishable from a call-cleared notice; and the unparsed runs carry the
  shape of a half-duplex receiver blanked during our own transmission, which points at
  `tx_quiet_ms` being 20 ms against a frame that occupies about 12 ms. No product code,
  test, or configuration changed in this unit.
- Record the `0.3.0` design in `.agent/plan-0.3.0.md`, with evidence row `M4-E117`. Raising
  `tx_quiet_ms` removed the intermittent losses, which closes the collision attribution by
  intervention and withdraws the journal correlation `M4-E116` had listed. The design covers
  a server-side send queue keyed by target with last-write-wins coalescing, bounded retry,
  and success defined as the addressed device's own field matching the intent in an
  observation stamped after the write rather than as any observed change. No product code,
  test, or configuration changed in this unit.

### Notes

- **Eight tests were removed, not adjusted.** They covered the client-side observation
  lease, which the server-side confirmation replaces: the page used to watch a light's own
  state after a write and time the window itself. Nothing reaches that code any more, so the
  tests were deleted along with it rather than re-pointed at something they no longer
  describe. What they guaranteed — that a send ends at confirmed or unconfirmed and never
  silently, that a device is not reported changed on a stale or wrong-generation
  observation — is now guaranteed server-side and covered by `test/tx-confirm.test.ts`.
- The elevator call frame remains a candidate with negative evidence behind it: pressing the
  wallpad's own call button put no `0x34` set frame on this line, and a byte-level diff of
  every device across that moment found nothing else moving. One press now gives a verdict,
  because a registered call shows up in the new `call` field.
- The three `0x7F` entrance macros are kept for the subphone work. They cannot fire from
  here: the compatibility gate requires having seen that exact three-frame sequence on this
  line, in this transport generation, within 45 seconds. The card now says so. One gap is
  recorded for that work: `household:ringing` has no entry in the proof table, so it could
  not pass even with the subphone line attached.
- Confirmation requires a device-state source. Without one the coordinator writes once and
  reports `socket_written_unconfirmed`, which is the path every pre-0.3.0 fixture exercises.

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
