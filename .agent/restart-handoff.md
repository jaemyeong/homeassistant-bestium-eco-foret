# M4.5 Static Acceptance Handoff

Prepared: 2026-08-24 (Asia/Seoul)

This is the authoritative handoff after the bounded native/static `0.2.3`
delayed post-write RX observation repair. Start from:

`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`

The former trailing-space path must remain absent. The research sibling at
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret-research` may be
existence-checked only. Do not read or copy its contents; M4.5 used no legacy
evidence.

This document cannot contain the SHA of its own commit. The containing local
task commit must have subject
`fix(m4): observe delayed light state after write`, parent
`023ec63f1faa502b3b413749820848119e15f409`, a Good signature, and a clean
worktree. The parent is the Good-signed local-only handoff commit. Its parent
`bbd3ecd93034e8cd95f4f57c02ad4c45ee7ced56` remains `origin/main`,
`git ls-remote origin main`, and public GitHub `main`. No push is authorized;
local `main` should therefore be exactly two signed commits ahead.

## Accepted native/static result

- App version is `0.2.3` across the root package, App package, App config, and
  Docker `io.hass.version` label.
- `socket_written_unconfirmed` and `deviceConfirmed:false` remain unchanged
  transport-only API evidence. Node socket write/drain is not treated as
  physical execution, protocol ACK, or causal device confirmation.
- The emitted UI retains one commit-preflight Light 1–3 ON/OFF baseline:
  desired state, baseline state, strictly bounded `lastSeenAtMs`, and
  generation.
- After the socket-written result arrives, one client-side pending observation
  starts its full bounded window and evaluates only the existing `/api/status`
  device payload in `draw()`.
- Success requires a fresh entry in the same generation with
  `lastSeenAtMs` strictly newer than baseline and the requested state. A
  baseline already in the desired state is never promoted.
- Stale/equal/older or wrong-generation data cannot succeed. A newer opposite
  state remains pending. A generation change ends as
  `observation_interrupted`; timeout ends as
  `socket_written_unconfirmed · 소켓 전송됨 · 요청 상태 미관측`.
- Pending observation natively and programmatically leases review, semantic
  action, temperature-send, RAW, Capture/Stop, and Download controls. It
  performs no retry or retransmission.
- Unsupported gas/heating/elevator/entrance/query/RAW actions remain
  socket-only/unconfirmed. Gas OPEN remains absent and rejected.
- `tx_observation_timeout_ms` defaults to 10,000 ms, accepts 1,000–30,000 ms,
  and is exposed only as a bounded safe status value. No endpoint/user/secret
  is added to status.
- No new endpoint, server receipt, attempt ID, event bus, queue, background
  action, or long-held `/api/action` request exists.

## Verification record

- Entry root, subject, parent, Good signatures, clean tree, empty stage,
  public-parent equality, baseline version `0.2.2`, Node `v24.14.1`, and
  baseline 91/91 all passed.
- Exact project-local `product_implementer` ran under the host-bound
  `gpt-5.6-luna`/`max` role after a fresh no-override read-only canary.
- Tests-first ordering was preserved. Parent independently reproduced the
  initial RED and later the three repair REDs.
- Final parent results: repair 3/3, M4.5 7/7, existing observed-action 3/3,
  coordinator single-write coverage, and full native suite 98/98.
- JSON/schema/default/bounds/version checks, emitted inline-script compilation,
  gas OPEN rejection, `git diff --check`, exact paths, and empty staging pass.
- Graphify is refreshed at 436 nodes/496 edges. CodeGraph is current at 15
  files/527 nodes/2,781 edges. Exact-root Serena 1.7.0 reports TypeScript LSP
  `ready`; `ui.ts` and `settings.ts` are clean. Only the historical missing
  Node ambient declarations remain in `m2.ts` and `test/m2.test.ts` because
  package installation was not authorized.
- The first read-only audit found one pending-control P1 and two timing/alert
  P2 findings. Repair round 1 closed them. Fresh re-audit returned PASS with
  no actionable P0-P3 and explicitly no repeated P0/P1.
- Current official Node 24, WHATWG timers, WAI-ARIA 1.2, and Context7 evidence
  was refreshed. Sosumi: N/A: M4.5 has no Apple API, HIG, or Swift claim.

## Evidence limits and authority

This native/static acceptance does not prove real browser scheduling, focus,
or assistive-technology announcements; Home Assistant or Ingress behavior;
TCP/EW11 behavior; protocol ACK; causality; actual TX; or device state. The
single historical Light 1 live observation does not establish a latency
distribution or authorize another action.

This handoff does not authorize push, Home Assistant/browser/Ingress access or
mutation, Capture/Stop/Download, production socket or EW11/private-LAN access,
actual TX/control, device change, package installation, local Docker, force
push, release creation, amend, signing bypass, or broad staging. Earlier live
or publication authority must not be reused.

## Paste this in the fresh session

```text
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`에서 M4.5의
서명된 local-only `0.2.3` 결과를 read-only로 재확인하고 현재 상태만 보고해.

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
- HEAD subject `fix(m4): observe delayed light state after write`, parent
  `023ec63f1faa502b3b413749820848119e15f409`, Good signature
- parent subject `docs(m4): prepare delayed rx observation handoff`, parent
  `bbd3ecd93034e8cd95f4f57c02ad4c45ee7ced56`, Good signature
- clean worktree, empty staging, local `main` exactly two commits ahead
- `origin/main`, `git ls-remote origin main`, public GitHub `main` equal
  `bbd3ecd93034e8cd95f4f57c02ad4c45ee7ced56`
- root/App/config/Docker version equality at `0.2.3`
- Node `v24.14.1`, full native 98/98, `git diff --check`
- Graphify 436 nodes/496 edges, current CodeGraph 15 files/527 nodes/2,781
  edges, exact-root Serena TypeScript LSP `ready`
- Current checkpoint sentinel exactly:
  `Next event: obtain fresh explicit approval before any push or live M4.5 validation; do not access Home Assistant, Ingress, Capture, EW11, or perform any device action without that approval`

검증 결과와 native/static 한계를 보고한 뒤 멈춰. 새 명시적 승인 없이는
stage/commit/push/live/external action을 하지 마.
```

## Operator note

Open the next session at the exact root without cleaning, rebasing, staging,
amending, or pushing. Paste the entire fenced prompt above. A separate future
push or live canary requires fresh explicit user authorization and a new
bounded gate.
