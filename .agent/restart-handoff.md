# M4.8 Static Acceptance Handoff

Prepared: 2026-08-25 (Asia/Seoul)

This is the authoritative handoff after the `0.2.5` UI rebuild and transmit
repair. Start from:

`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`

The former trailing-space path must remain absent. The research sibling at
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret-research` may be
existence-checked only.

## What was wrong, and what fixed it

The transport was never broken. The user had already made a light turn on by
sending a raw frame from the debug lab. The light buttons appeared dead because
an observed control only opened a preview, and its actual write sat behind a
second button in a card below every other card — the user confirmed they did not
know that card existed. One activation now classifies the action and, when the
server calls it observed, writes it immediately.

A second, independent defect was repaired in the same pass. `rejectChallenge`
bound the challenge to `rxByteEpoch`, `readEpoch`, and `readinessRevision`, all
of which advance on every received byte, so every confirmation raced the next
frame. That is why the heating candidates, the elevator, the entrances, and the
RAW lab only ever worked when a click landed between frames.

## Accepted native/static result

- Four version surfaces read `0.2.5`.
- Observed controls send on one activation. Candidates keep their typed
  confirmation, moved directly under the banner that asks for it. The RAW lab
  keeps its three steps.
- The banner carries `off`, `quiet`, `ready`, `awaiting`, `sending`,
  `confirmed`, `unconfirmed`, and `doorbell`. Every send ends in one of them.
- The page is the canonical design: header, control and debug tabs, tiles,
  heating split into an observed Zone 1 and candidate Zones 2-4 with a 44px
  current temperature, and a debug surface with capture metrics, a frame table of
  series, hex, reading and elapsed time, query-only tiles, and the raw lab's
  explicit three steps.
- Home Assistant design tokens are mirrored locally. An Ingress iframe inherits
  neither the theme variables nor the `ha-*` components, and the page takes on no
  external asset dependency.

## Deliberate departures from the prototype

- Capture controls stay on the control surface beside the banner that points at
  them. That adjacency is what fixes the reported problem.
- The entrance call banner announces the call but offers no open control: the
  encoder has no observed open frame, the same contract gas open already carries.
- The typed confirmation is kept rather than auto-filled.

## Verification record

- Full native suite 102/102 on Node `v24.14.1`; `git diff --check` clean.
- Every screen state was checked in a real Chrome browser at 1568px and at 390px,
  not only against the fake DOM. That check is what the M4.6 incident lacked, and
  it caught two layout defects the suite could not see.
- The one-tap path was driven end to end through the emitted script: one
  activation produced a preview then a commit, wrote the Light 1 ON frame, and
  moved the banner to its sending state.

## Evidence limits and authority

This is native and static. It does not prove Home Assistant or Ingress
behaviour, TCP/EW11 behaviour, protocol ACK, causality, actual TX, or device
state. Publishing `0.2.5`, updating the installed App, and any live send each
require their own explicit approval. The user has already approved one live
Light 1 verification for 0.2.6, but it depends on `0.2.5` being published and the
App updated first.

Next event: obtain fresh explicit approval before publishing `0.2.5` or performing any live validation; the user must update the installed App in Home Assistant themselves for `0.2.4` to take effect, and no agent may access Home Assistant, Ingress, Capture, EW11, or perform any device action without that approval
