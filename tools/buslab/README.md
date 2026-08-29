# buslab

A local RS485 measurement tool. It holds its own TCP connection to the EW11 gateway from this
development machine, records every byte with two clocks, and lets a session drive it one command
at a time. It exists because the add-on's capture can never pair a command with its reply: our
own writes are not echoed on this line, so a capture shows the answer and not the question.

The design and the work breakdown are in `.agent/plan-buslab.md`. What the gateway's own
settings imply for timing is in `.agent/analysis-ew11-timing-and-group-frames.md`.

## Configuration

The gateway address is not in this repository and must not enter it. Provide it either way:

    export BUSLAB_HOST=... BUSLAB_PORT=8899

    cp tools/buslab/config.example.json tools/buslab/config.json   # gitignored

The environment wins over the file. Neither the address nor the port is written into a run's
artifacts: everything on its way to disk passes through a redactor first.

## Commands

    node tools/buslab/cli.ts start  --run <name> [--seconds N]
    node tools/buslab/cli.ts status --run <name>
    node tools/buslab/cli.ts mark   --run <name> --label "what just happened"
    node tools/buslab/cli.ts stop   --run <name>

`start` stays in the foreground and holds the socket. Run it in another terminal, or with `&`,
and drive it with the other three. Each run writes to `tools/buslab/runs/<name>/`, which is
gitignored.

## What a run records

`run.ndjson`, one JSON object per line, all of it stamped with `wallMs` (`Date.now()`, for
lining up against add-on captures) and `monoNs` (`process.hrtime.bigint()`, for differences).

| `t` | meaning |
| --- | --- |
| `open` | the socket connected |
| `start` | the run began |
| `rx` | one TCP read, verbatim: `seq`, `byteLength`, `hex` |
| `mark` | an operator action, with its label |
| `backlog` / `backlog_cleared` | the writer fell behind, and recovered |
| `error` / `closed` | a socket error, or the peer dropping us |
| `stop` / `close` | the run ended |

Two properties are deliberate and worth knowing before reading a run.

**A read is not a frame.** The gateway flushes serial bytes only after the line has been quiet
for its `Gap Time` (50 ms on this device), and TCP may still split or merge what it sends. One
read in five carries more than one frame, and a frame can straddle two reads. The link records
reads; turning them into frames is the framer's job, downstream, where the raw bytes are still
on record.

**Nothing is paused to keep up.** The add-on pauses its transport while an append is in flight,
which distorts exactly the timing being measured here. If the writer falls behind, a `backlog`
record says so rather than the tool hiding it by slowing the read.

**Every timestamp is taken in the daemon.** `process.hrtime.bigint()` counts from an arbitrary
origin per process, so a stamp taken in the CLI and a stamp taken in the daemon cannot be
subtracted. The CLI only carries requests.

## Reading a finished run

Three commands read a run, or any add-on capture, and touch no network:

    node tools/buslab/cli.ts frames    --run <name> | --file <path>
    node tools/buslab/cli.ts inventory --run <name> | --file <path>
    node tools/buslab/cli.ts around    --run <name> --label "..." [--window 2000] [--baseline 10000]

`frames` reports how many frames the bytes contained, how many bytes were left over, how many
frames straddled a read, and the gap distribution a write has to fit into. `inventory` groups
frames by the tuple that says what they are about — device, kind, sub-command, address — and
lists which byte positions ever moved. `around` answers "what changed when I pressed that", by
comparing the state a tuple held before the window against the first one inside it.

Two things the analysis deliberately does **not** do. It assigns no meaning: a tuple is
`19/04/40/11`, not "light 1", because the discovery has to work before any name exists. And it
compares frames only within one length, because a tuple can arrive in several shapes — the light
group is both an eleven-byte direct reply and a thirteen-byte status frame, and lining those up
by position puts a payload byte against a checksum byte.

## The framer's external standard

The framer's only check that is not self-confirmation is a capture the add-on took, not this
tool. On `capture-1788009200284.ndjson` — 54.6 minutes, 17,561 reads, 350,203 bytes — it must
find 21,095 frames and leave zero bytes unexplained, with exactly one frame straddling two
reads and 20.1 % of reads carrying several. That capture is the operator's own household
traffic and is not committed; point at it to run the check:

    BUSLAB_CAPTURE=~/Downloads/capture-1788009200284.ndjson npm test

Without the variable those three tests skip rather than quietly pass.

## Sending

    node tools/buslab/cli.ts send --run <name> --hex <hex> [--arm] [--expect <mask>] \
        [--quiet-ms 60] [--quiet-wait-ms 1000] [--direct-ms 150] [--polling-ms 3000]

Without `--arm` nothing reaches the bus: the frame is checked, reported and dropped. With it,
the send waits for the line to fall quiet for `--quiet-ms`, writes, and then listens for a frame
matching `--expect`.

**What a send reports, and what each figure means.**

| field | meaning |
| --- | --- |
| `outcome` | `dry_run`, `written`, `refused`, `busy`, `no_quiet_window`, `write_failed` |
| `achievedQuietMs` | how long the line had actually been silent when the write went out |
| `quietWaitedMs` | how long the wait took; the distribution of this is a measurement in itself |
| `matchingFrameAgoMs` | how long since a frame matching `--expect` last appeared, **before** the write |
| `reply.window` | `direct` inside `--direct-ms`, `polling` after it |
| `reply.latencyMs` | write callback to matching frame |
| `waitedForReply` | false when no `--expect` was given, so silence is not mistaken for an answer |

`no_quiet_window` means the line never fell quiet and **nothing was written**; a frame put into
traffic is a collision, not a measurement. The command exits non-zero for it, so a loop of twenty
sends cannot quietly skip half of them.

**Latency is an upper bound and cannot be otherwise.** The write callback guarantees only the
kernel buffer, the path adds two WiFi round trips, and the gateway holds each direction until
the serial line has been quiet for its `Gap Time` — 50 ms on this device, reported alongside as
`gatewayFlushMs`. A reply the gateway batches with something else is invisible below that floor.

`matchingFrameAgoMs` exists because the wallpad polls about every two seconds, so a poll landing
inside a 150 ms window by chance is roughly a one-in-fourteen event. "Arrived in the window" and
"arrived because of us" are different claims, and only the first is an observation.

One send at a time. A second while one is in flight is refused rather than run beside it: one
frame on the line at a time is the premise of the whole exercise.

## Comparing the two encoders

`tools/buslab/encode.ts` builds frames from the frame rule alone and prints the add-on's
`encodeSemanticAction` output beside its own. Neither is the authority; the bus is. Where they
differ the tool keeps both and calls it a finding — as they do today for all-zones-off, where
the add-on sends four per-zone frames and the wallpad sends one.

## Safety

A phase is a list, matched by exact bytes rather than by pattern: a mistyped XOR that satisfied
a pattern would leave the wallpad ignoring the frame, and recording that silence as "no
response" is a false finding. Phase one is the six light on/off frames. Phase two adds the two
light group frames. Phase three adds heating: eight zone on/off frames, and two zone 1 target
frames that move it to 21 °C and back to 23 °C. Every allowed target is below every room
temperature on this bus, so nothing on the list can call for heat. The heating group frames are
not on it; the off frame was watched twice but has not been asked for, and the on frame has
never been observed anywhere.

Refusals are not a phase and no flag opens them, `--allow-all` included. The `0x7F` subphone
macros open a door. The `0x1E 02` frame's meaning is undecided and may be a door-open command.
Gas may be closed and never opened. And a heating target above 23 °C is refused by name rather
than merely left off a list: that is the target every zone already holds, so no frame from here
can set a zone warmer than the household chose, and unlike a light the unsafe direction here
burns gas for as long as nobody notices.

That refusal is not the whole safety story, and the README said otherwise until this was
corrected. A zone turned **on** at the existing 23 °C target will heat a room that has since
fallen below it, and no rule inside the guard can see the room. Read the current temperatures
from a full poll before arming, and stop if any zone sits at or under its target. The allowlist
was written against rooms at 24 °C and warmer; that is a fact about a day, not about the
protocol. The elevator is outside every phase but is not on that list,
because it waits for its own approval rather than being forbidden for ever.

Home Assistant must stay switched off while a run is measuring. It reaches the same RS485 bus
through the same gateway, and a second writer on a half-duplex line makes every collision
unattributable.
