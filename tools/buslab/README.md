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

## Safety

Sending is not implemented yet; that is Epic E3 of the plan. When it lands, the first phase
allows only the six light on/off frames, by exact byte match, and the `0x7F` subphone macros,
the `0x1E 02` frame and gas open are refused by a list no flag opens.

Home Assistant must stay switched off while a run is measuring. It reaches the same RS485 bus
through the same gateway, and a second writer on a half-duplex line makes every collision
unattributable.
