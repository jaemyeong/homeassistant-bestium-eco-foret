# M4.11 Static Acceptance Handoff

Prepared: 2026-08-25 (Asia/Seoul)

This is the authoritative handoff after the `0.2.8` transmission repair. It supersedes
the M4.10 handoff. Start from:

`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`

The former trailing-space path must remain absent. The research sibling at
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret-research` may be read to
produce specifications only, per `AGENTS.md` line 7; no legacy source may be copied.

## Read this first

`.agent/spec-device-protocol.md` is the frame specification for every device, tagged by
what the capture proves against what the legacy only asserts. It is the reference for this
release and for the two capture experiments that follow it.

## What was actually wrong

The operator worked the wallpad by hand during a capture, so the bus carried real commands
next to their replies. Heating had three independent defects at once, and none of them was
in the transport or the gates:

- the sub-command was `0x40` where the bus uses `0x46` for On/Off and `0x45` for the target
  temperature,
- the payload was shaped like a status reply, carrying the temperature twice and the zone as
  an extra byte,
- and `makeF7` declared a length one byte short of the frame it built.

The decoder held the mirror image of the same invention. Its `0x18` `0x02` branch required a
layout that fitted only frames we produced ourselves, so encoder, decoder, test builder and
test assertion confirmed each other and never touched the bus. That loop is why four
releases passed a green suite with a frame the wallpad cannot parse.

## What 0.2.8 repaired

The operator reported that control worked only after pressing a button repeatedly, that
all-zones-off errored, and that one failure left the review card unusable. All three were
measured rather than guessed.

- The busy-line gate was reading TCP arrival times, not RS485 idle, and was counting the
  capture store's own pause and resume as bus traffic. The send now waits for the window
  instead of refusing it. See M4-E111.
- A multi-frame send could never finish on this bus, because the inter-frame check bound
  counters that advance on every received byte. 0.2.7 routed all-zones-off into that path,
  so this is a regression from this session's own previous release. See M4-E112.
- `txRetryLocked` had no clearing path at all. See M4-E113.

## Accepted native/static result

- Six version surfaces read `0.2.8`.
- Full native suite 132/132 on Node `v24.14.1`; `git diff --check` clean. Read that number
  with M4-E104 in hand: `test/m2.test.ts` segfaults Node about once in thirteen runs, on
  public source, from Node's own TypeScript stripping. Run the suite more than once.
- The whole 306.8 s capture replays through the product monitor at 1,957 valid frames, zero
  invalid journal entries and zero leftover bytes, matching an independent parser exactly.
- All ten heating commands observed on the bus regenerate byte for byte.
- Every screen state was checked in a real browser at full width, 768 px and 390 px on both
  tabs. That check found three layout defects the suite could not see, one of which had been
  shipping since 0.2.5.

## Deliberate limits

- Heating is `inferred_candidate` on all four zones. The frames are the wallpad's own, but
  the add-on has never actuated heating with them, and `observed` means one tap with no
  confirmation. Promotion waits for a live result.
- The elevator call frames come from the legacy add-on's defaults for this building, not
  from a capture. Down rests on a configuration the operator reports having worked; up is
  marked 미지원 by the legacy itself, and the page says so.
- The entrance macros are unchanged in what they send. No `0x7F` frame has ever appeared on
  this bus, the legacy treats the subphone as a separate RS485 line, and the server's
  compatibility gate blocks these sends. Only the labels and the explanation changed.

## What the next rounds need

1. A live heating press, to promote heating to `observed`.
2. A capture while the wallpad's own elevator call button is pressed, up and down.
3. A capture while a real doorbell call comes in and the wallpad opens the door. This is the
   one that decides whether the entrance macros can ever reach their line from here.

## Evidence limits and authority

This is native and static. `0.2.8` is published at `18bf6d2` and GitHub reports it
verified; M4-E114 has the record. Updating the installed App and any live send still
require their own explicit approval.

The quiet wait reduces lost sends but does not eliminate them: a frame damaged by a
collision is still not retried. Retry-until-confirmed is specified in
`.agent/spec-device-protocol.md` §4.3 and is the next round.

Next event: the user must update the installed App in Home Assistant themselves for `0.2.8` at `18bf6d2` to take effect; afterwards the approved live verification may proceed for Light 1 and heating, and the elevator call and the entrance line each still need their own capture experiment before implementation. No agent may access Home Assistant, Ingress, Capture, EW11, or perform any other device action without fresh explicit approval
