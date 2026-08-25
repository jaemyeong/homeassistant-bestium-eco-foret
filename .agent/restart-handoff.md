# M4.9 Static Acceptance Handoff

Prepared: 2026-08-25 (Asia/Seoul)

This is the authoritative handoff after the `0.2.6` transmit repair. It supersedes
the M4.8 handoff, which was written before `0.2.5` was published and is stale in
the one way that matters: it says publication is still pending. Start from:

`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`

The former trailing-space path must remain absent. The research sibling at
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret-research` may be
existence-checked only.

## What `0.2.5` actually did in the operator's hands

`0.2.5` is public at `521149f`, the user updated the installed App themselves,
and the page was inspected live. Lights 1, 2 and 3 turn on and off from the page,
which is what the M4.8 one-tap change was for. Two defects remained, and the user
reported both:

- Commands were separated by a long delay.
- Every other control showed the review card, but its confirm button never became
  usable.

Both root causes were measured on the running add-on rather than reasoned about.

## What was wrong, and what fixed it

The confirm button was disabled by a client-side comparison of the preview's
`readinessRevision` against the next status poll's. That value hashes
`rxByteEpoch`, `readEpoch`, `validFrameEpoch` and `tailHash`, so on a live bus it
moves on every received byte. Measured through the Ingress iframe: the revision
had already changed 2.5 s after the preview, `issueChallenge` and `reviewCommit`
both read `DISABLED`, and the banner sat at `awaiting`.

The comparison was a duplicate. `send` re-evaluates every gate on the live
request and re-reads generation, connection, `rxByteEpoch` and `readEpoch`
immediately before the write. The client copy was the only one that could never
pass on a live bus, so it was removed rather than repaired.

The delay was a page-wide lease. Any pending observation disabled every send
control for the full observation window, which was 10 s against frames arriving
about every 1.6–1.9 s. Only the watched light is leased now, and the window is
3 s.

## Accepted native/static result

- Six version surfaces read `0.2.6`: `bestium-eco-foret/config.json`, both
  `package.json` files, `bestium-eco-foret/Dockerfile`, and `EXPECTED_VERSION`
  in `test/m2.test.ts`.
- Full native suite 106/106 on Node `v24.14.1`; `git diff --check` clean. Read that
  number with M4-E104 in hand: `test/m2.test.ts` segfaults Node about once in
  thirteen runs, it did so on public `521149f` before any of this work, and the
  fault is in Node's own TypeScript stripping rather than in any test or in the
  product. Run the suite more than once before believing it.
- The new cooldown test is in `test/tx-cooldown.test.ts` rather than in
  `m2.test.ts`, because adding roughly 3 KB of anything to that file measurably
  raises the crash rate.
- Candidate controls send on one tap. The page supplies the confirmation phrase.
- A pending observation leases `light-<n>-on` and `light-<n>-off` for the watched
  light only. The review and capture controls stay page-wide because they are
  single-instance.
- The candidate cooldown is asserted for the first time. It is charged at
  challenge issuance, not at commit, and `send` skips its own check for an
  accepted challenge precisely because issuance already charged it. Removing
  either gate alone leaves the other standing; the test dies only when both go.

## Deliberate reductions, recorded rather than buried

- The typed confirmation phrase is gone for catalog candidates, at the user's
  explicit instruction. What still stands is `speculative_transmit_enabled` and
  `unsafe_transmit_enabled` (both off by default), the current-generation 7F
  proof for entrance macros, and the speculative and unsafe cooldowns. The
  arbitrary-frame lab keeps its full three-step flow, so the typed phrase still
  guards the one path that can put any bytes on the bus.
- A 3 s observation window leaves under two frames of margin. Predict this before
  the user sees it: a command that physically succeeded can still end at
  `소켓으로 보냈지만 요청한 상태는 관측하지 못했습니다` on timing jitter alone.
  `tx_observation_timeout_ms` is the knob if it proves too tight.

## Evidence limits and authority

This is native and static. The live measurements in M4-E102 prove two specific
defects on `0.2.5`; they do not prove that `0.2.6` fixes them in the operator's
hands. Publishing `0.2.6`, updating the installed App, and any live send each
require their own explicit approval. The user has already approved one live
Light 1 verification, but it depends on `0.2.6` being published and the App
updated first.

Next event: obtain fresh explicit approval before publishing `0.2.6`; `0.2.5` is already public at `521149f` and the user updated the installed App themselves, and no agent may access Home Assistant, Ingress, Capture, EW11, or perform any device action without fresh approval. The user has approved one live Light 1 send for the verification round, which depends on `0.2.6` being published and the App updated first
