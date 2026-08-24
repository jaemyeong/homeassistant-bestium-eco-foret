# M4.6 Static Acceptance Handoff

Prepared: 2026-08-25 (Asia/Seoul)

This is the authoritative handoff after the bounded native/static `0.2.4`
quarantine-unification, freshness-narrowing, and monitor-rendering work unit.
Start from:

`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`

The former trailing-space path must remain absent. The research sibling at
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret-research` may be
existence-checked only. Do not read or copy its contents; M4.6 used no legacy
evidence.

The M4.6 work unit is three signed local commits, because amending a signed
commit is not permitted and two corrections were needed after the fact.

1. `d4463c5db4a09d440133a99249ac2b4f53680303`,
   `fix(m4): unify tx quarantine and monitor labels`, parent
   `297233309325e13e90193c3ef1425b5fcf165d6e`. Superseded in part by (3).
2. `92027c1a5f9130b4dab7eb9cc206f21d2c1380d5`,
   `docs(m4): record measured m4.6 red and mutants`. It exists because (1)
   asserted a tests-first RED enumeration inherited from the preceding session
   rather than measured.
3. The containing commit, which cannot carry its own SHA. It must have subject
   `fix(m4): restore rx freshness gate for observed actions`, parent
   `92027c1a5f9130b4dab7eb9cc206f21d2c1380d5`, a Good signature, and a clean
   worktree. It is repair round 1 against the P0 an independent audit found in
   (1).

## Publication state

Public `main` is at `0.2.3`. Its commit
`297233309325e13e90193c3ef1425b5fcf165d6e` equals `origin/main` and
`git ls-remote origin main`, and `git show
origin/main:bestium-eco-foret/config.json` parses as version `0.2.3` with
`boot: manual_only` and `panel_title: BESTIUM Capture`.

That publication was **not** performed by this session lineage. The reflog
records `2972333 refs/remotes/origin/main@{2026-08-24 18:56:52 +0900}: update by
push`, sixteen minutes after the M4.5 session made its last local commit and
after that session had already written its documentation. The push advanced
`origin/main` from `bbd3ecd93034e8cd95f4f57c02ad4c45ee7ced56` and published two
commits at once. No agent here performed it and none may claim it. Earlier
documents asserting that no push was authorized, that local `main` was two
commits ahead, and that public `main` remained `0.2.2` were false in the present
tense and have been corrected.

Publishing `0.2.4` is **not** authorized. After the containing commit, local
`main` is exactly three signed commits ahead of public `main`.

## Accepted native/static result

- App version is `0.2.4` across the root package, App package, App config, and
  Docker `io.hass.version` label.
- One `quarantinedFor(state)` helper now answers the transport-quarantine
  question for the status chip, the readiness gate, the live write, and the
  speculative challenge. The chip and the gate can no longer disagree.
- A fresh transport's `validFrameGeneration` of `0` means "no valid frame
  observed yet in this generation" and is no longer used as a quarantine lookup
  key. The blocked interval is unchanged, because `currentGenerationRx` was
  already false there; only the reported reason changed, from a quarantine that
  never happened to the missing current-generation RX frame.
- RX freshness gates every action class, byte-identically to the parent. The
  first candidate narrowed it to inferred and unsafe actions; an independent
  audit returned that as a P0 and repair round 1 reverted it. The justification
  had compared transport idle recovery, which is armed on socket inactivity,
  against a freshness threshold that measures valid-frame age, so a line
  delivering bytes that never parse into a valid frame never reconnected and the
  exposure was unbounded. A regression test now covers that line for both the
  preview and the live path and asserts that no byte reaches the socket.
- Monitor rows read label-first with a unit, `현재 29°C · stale` rather than
  `29 · stale · currentC`. The raw DTO key no longer trails the value, and
  adjacent monitor spans are block-level.
- `boot` is `auto`, the panel is titled `BESTIUM 월패드`, and the App name and
  description describe wallpad monitoring and guarded control. `boot: auto`
  starts the container only; opening a socket and starting capture still require
  an authorized `POST /api/capture`.
- Gas OPEN remains absent and rejected. No retry, retransmission, endpoint,
  server receipt, or queue was added.

## Verification record

- Entry root, absent trailing-space path, existence-only research sibling,
  branch/upstream at ahead 0 / behind 0, Good parent signature, the exact eight
  modified paths with no untracked file, `git diff --check`, and four version
  surfaces at `0.2.4` all passed. Node is `v24.14.1`.
- Reverting the six product and configuration paths to the parent commit while
  holding the tests at their M4.6 expectations reproduces exactly 5 failures of
  99, measured in this session: `RED: URL-installable repository layout is
  canonical`, `RED: config strictness and exact static contract`,
  `RED: Dockerfile allowlist and pinned production constraints`,
  `RED-exception: actual status JSON drives the emitted UI monitor with 1-based
  device DTOs`, and `M4.6 RED: quarantine chip matches the gate and observed
  control survives a quiet bus`. That demonstrates the tests encode the M4.6
  expectations independently of the implementation; it is not itself evidence of
  authoring order, and the tests-first ordering is inherited from the preceding
  session's record rather than observed here. The full native suite passes 99/99.
- Two targeted mutants were killed. Restoring `quarantinedFor` to its old
  `validFrameGeneration ?? getGeneration()` form fails the assertion that a
  generation which has not yet observed a frame must not be reported as
  quarantined; removing both narrowed freshness gates fails the assertion that
  RAW transmission keeps the freshness requirement. This is a partial substitute
  for the missing independent audit, not a replacement for it.
- The M4.6 product code and its tests were written under Claude Code by the
  preceding session's agent, acting as this environment's designated implementer
  at the highest available model tier and maximum reasoning effort. The Codex
  `product_implementer` / `gpt-5.6-luna` delegation does not apply here and was
  not faked. This session made one product-tree edit, restoring the trailing
  newline that `test/m2.test.ts` had lost, and prepared and signed the commit.
- The handoff's audit diff predated the `validFrameGeneration = 0` repair, so a
  freshly generated diff replaced it.
- An independent adversarial review was obtained on the sixth attempt. Five
  freshly spawned reviewers failed first: one `403 Unable to verify organization
  membership`, one `529 Overloaded`, and three that executed and returned no
  report. The sixth succeeded once it was asked to write its report to a file
  instead of returning text. It did not write the code, did not inherit the
  implementer's context, and left the repository unmodified, verified against a
  baseline recorded before it started. It returned one P0, three P2, and one P3,
  and contradicted the implementer's own freshness conclusion. The P0 was
  reproduced independently before being repaired.
- Three mutants are killed by the repaired test: the old `quarantinedFor` form,
  `quarantinedFor` returning `false` unconditionally, and removal of both
  freshness gates. Reverting the six product and configuration paths to the
  parent while holding the tests at their repaired expectations reproduces
  exactly 5 failures of 99.
- Graphify is refreshed at 438 nodes/498 edges/42 communities and CodeGraph at
  15 files/527 nodes/2,793 edges; both are Git-ignored and neither is staged.
  Exact-root Serena 1.7.0 reports TypeScript LSP `ready`, `ui.ts` is
  diagnostic-clean, and only the historical missing Node ambient declarations
  remain in `m2.ts` and the native test.

## Evidence limits and authority

This native/static acceptance does not prove Home Assistant or Ingress behavior,
TCP/EW11 behavior, protocol ACK, causality, actual TX, or device state.
`boot: auto` is a manifest value only; it reaches the installed App solely if the
user updates the App in Home Assistant, which this session did not do.

Three items are knowingly left open by user decision. The vehicle monitor row
reads `관찰 전용 …` because its old trailing note became a leading label. No test
pins the adjacency of `generation += 1` and `validFrameGeneration = 0` inside
`attachTransport`, on which the quarantine repair's safety depends. The live
quarantine rejection in `send` still names a speculative challenge although
`send` also serves observed actions; that wording predates M4.6.

This handoff does not authorize push, Home Assistant/browser/Ingress access or
mutation, Capture/Stop/Download, production socket or EW11/private-LAN access,
actual TX/control, device change, package installation, local Docker, force
push, release creation, amend, signing bypass, or broad staging. Earlier live or
publication authority must not be reused.

## Paste this in the fresh session

```text
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`에서 M4.6의
서명된 `0.2.4` 결과를 read-only로 재확인하고 현재 상태만 보고해.

이 프롬프트 자체는 push나 live validation을 승인하지 않는다. Home
Assistant/browser/Ingress, Capture/Stop/Download, socket/EW11/private LAN,
실제 TX/device action, package 설치, Docker, force push, release를 시작하지
마. 새 사용자의 명시적 지시가 별도로 주어질 때만 그 정확한 범위를 새
task authority로 평가해.

먼저 `AGENTS.md`, `.agent/progress.md`, `.agent/restart-handoff.md`,
`CHANGELOG.md`를 읽고 Graphify -> CodeGraph -> Serena bootstrap을 적용해.
research sibling은 존재 여부만 확인하고 내용을 읽지 마.

다음을 확인해:

- exact root/toplevel과 trailing-space path 부재
- HEAD subject `fix(m4): restore rx freshness gate for observed actions`, parent
  `92027c1a5f9130b4dab7eb9cc206f21d2c1380d5`, Good signature
- clean worktree, empty staging, local `main`이 정확히 3 commits ahead
- `origin/main`, `git ls-remote origin main`, public GitHub `main`이 모두
  `297233309325e13e90193c3ef1425b5fcf165d6e`이고 public config는 `0.2.3`
- root/App/config/Docker version equality at `0.2.4`
- Node `v24.14.1`, full native 99/99, `git diff --check`
- Graphify 438 nodes/498 edges, CodeGraph 15 files/527 nodes/2,793 edges,
  exact-root Serena TypeScript LSP `ready`
- Current checkpoint sentinel exactly:
  `Next event: obtain fresh explicit approval before pushing the signed M4.6 `0.2.4` commit or performing any live validation; do not access Home Assistant, Ingress, Capture, EW11, or perform any device action without that approval`

M4.6은 독립 적대적 감사를 6번째 시도에서 받았고, 그 감사가 찾은 P0을
repair round 1에서 수리했다. `AGENTS.md`는 repair round를 최대 2회로
제한하므로 남은 라운드는 1회다. 감사가 남긴 P3 두 건과 기존 문구 결함
한 건은 사용자 결정에 따라 M5로 미뤄져 있다.

검증 결과와 native/static 한계를 보고한 뒤 멈춰. 새 명시적 승인 없이는
stage/commit/push/live/external action을 하지 마.
```

## Operator note

Open the next session at the exact root without cleaning, rebasing, staging,
amending, or pushing. Paste the entire fenced prompt above. A push, a Home
Assistant update to `0.2.4`, or any live canary requires fresh explicit user
authorization and a new bounded gate. The outstanding independent audit should
come before any of them.

Next event: obtain fresh explicit approval before pushing the signed M4.6 `0.2.4` commit or performing any live validation; do not access Home Assistant, Ingress, Capture, EW11, or perform any device action without that approval
