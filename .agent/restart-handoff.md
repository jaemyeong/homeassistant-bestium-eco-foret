# M4.5 Delayed RX Observation Handoff

Prepared: 2026-08-24 (Asia/Seoul)

This is the authoritative prompt for the fresh Codex session after the signed
`0.2.2` publication and the first bounded live Light 1 ON canary. Start from:

`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`

The former trailing-space path must remain absent. The research sibling at
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret-research` may be
existence-checked only for this task. Product implementation agents must not
read it or copy anything from it; M4.5 needs no legacy evidence.

This document cannot contain the SHA of its own commit. The containing local
handoff commit must have subject `docs(m4): prepare delayed rx observation handoff`,
parent `bbd3ecd93034e8cd95f4f57c02ad4c45ee7ced56`, a Good signature, and a
clean worktree. The parent is the signed/public `0.2.2` publication-record
commit and must equal `origin/main`, `git ls-remote origin main`, and public
GitHub `main`; the local handoff commit is intentionally not authorized for
push and should leave local `main` exactly one signed commit ahead.

This handoff authorizes only the tests-first native/static M4.5 implementation,
read-only adversarial review, documentation, and the contract-required signed
local task commit. It does not authorize push, Home Assistant/browser/Ingress
mutation or access, Capture/Stop/Download, socket or EW11/private-LAN access,
actual TX/control, a device change, package installation, local Docker, force
push, or release creation.

## Preserved evidence and limits

- Entry source is public App `0.2.2`. Signed product commit
  `a8ac99829666e81929805b5c8ec4e553cf34279a` and containing publication
  commit `bbd3ecd93034e8cd95f4f57c02ad4c45ee7ced56` verified Good. Before this
  handoff commit, local `HEAD`, local `main`, `origin/main`, `git ls-remote`,
  and public GitHub `main` all matched the containing commit; GitHub reported
  `verified=true`/`valid`, and public App config exposed `0.2.2`.
- Baseline Node is `v24.14.1`; `npm test` passes 91/91. Root package, App
  package, and App config all parse as `0.2.2`; `git diff --check` passes.
  Graphify is an existing ignored 429-node graph, CodeGraph is current at 15
  files/522 nodes/2,614 edges, and exact-root Serena 1.7.0 has active
  TypeScript LSP `ready`.
- The explicitly approved agent-operated live canary opened the installed App
  through Playwright, not Aside Browser. Capture was already running and the
  TX gates were enabled, authorized, connected, quiet, current-generation,
  and fresh. Light 1 initially rendered `off · fresh`.
- Exactly one observed Light 1 ON action was previewed and committed. The
  reviewed frame was `f70b01190240110100b6ee`. The HTTP/TCP result was
  `socket_written_unconfirmed`; at roughly 250 ms and again after more than
  two seconds the UI still showed Light 1 off and immediately labeled the
  result `device not confirmed`. No browser console error appeared.
- The user then reported the physical light had turned on. A later Playwright
  status poll independently rendered Light 1 `on · fresh · generation 1`.
  A second preview was used only to inspect the frame and was canceled; final
  review state was idle. No other device or control was touched.
- This proves the one bounded browser/HTTP/socket path wrote a valid Light 1 ON
  action and a later same-session RX state showed ON. It does not establish a
  protocol ACK, causal correlation, a stable latency distribution, automatic
  retry safety, or correctness for any other device/action.
- Current code intentionally returns `socket_written_unconfirmed` after the
  socket write callback/backpressure boundary. `commitReviewed()` in
  `bestium-eco-foret/src/ui.ts` immediately renders that as a final negative,
  clears the review, and has no later reconciliation. The same file already
  polls `/api/status`; `draw()` already receives current-generation device
  entries with freshness and `lastSeenAtMs`. `protocol-debug.ts` already
  decodes Light 1–3 state. No server receipt subsystem is needed.
- Current Node 24 documentation and Context7 agree that `socket.write()` and
  `drain` prove buffering/write progress, not physical device execution. A
  later matching RX state must therefore be named `state_observed_after_write`,
  never protocol ACK or `deviceConfirmed`.
- A fresh read-only contradiction audit returned PASS with no actionable
  P0-P3. It checked the self-SHA constraint, public-parent/local-HEAD
  relationship, implementation authority, live/push prohibitions, socket
  versus RX terminology, light-only matcher boundary, exactly-once/no-retry
  requirement, RED/GREEN/audit ordering, and repeated-P0/P1 stop rule.

## Paste this in the fresh session

```text
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`에서 M4.5 delayed post-write RX observation 구현만 재개해.

목표는 이미 실제로 켜진 Light 1 송신을 UI가 즉시 실패처럼 표시한 문제를 고치는 것이다. 소켓 송신 결과는 그대로 정직하게 유지하고, 기존 `/api/status` 폴링에서 송신 이후 더 새로운 같은-generation 조명 상태가 관측되면 별도의 사후 관측 결과로 전환한다. 프로토콜 ACK나 인과관계가 증명됐다고 과장하지 않는다.

이 프롬프트가 승인하는 범위는 M4.5의 tests-first native/static 구현, read-only 적대적 감사, CHANGELOG/원장/핸드오프 갱신, 명시적 staging, signed local task commit까지다. push, Home Assistant/browser/Ingress 접근 또는 mutation, Capture/Stop/Download, production socket, EW11/private-LAN 접속/탐색, 실제 패킷 송신, device change, package 설치, local Docker, force push, release는 승인하지 않는다. 이전 live TX 승인이나 이 handoff를 새 live canary 승인으로 재사용하지 마. Aside Browser는 사용하지 마.

먼저 아래 파일을 순서대로 읽고 계약을 그대로 적용해.

1. `AGENTS.md`
2. `.agent/progress.md`
3. `.agent/restart-handoff.md`
4. `CHANGELOG.md`

고정 진입 조건:

- exact root와 Git toplevel은 `/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`여야 한다. trailing-space path는 없어야 한다. research sibling은 존재 여부만 확인하고 main agent와 product implementation agent 모두 내용을 읽지 않는다.
- HEAD subject는 `docs(m4): prepare delayed rx observation handoff`, parent는 `bbd3ecd93034e8cd95f4f57c02ad4c45ee7ced56`여야 한다. HEAD와 parent 모두 `git verify-commit`에서 Good이어야 한다.
- worktree와 staging은 clean이어야 한다. parent `bbd3ecd93034e8cd95f4f57c02ad4c45ee7ced56`는 local tracking, `git ls-remote origin main`, public GitHub `main`과 같아야 한다. local `main`은 push되지 않은 handoff commit 한 개만 앞서야 한다.
- `.agent/progress.md` Current checkpoint 마지막 줄은 정확히 `Next event: implement M4.5 delayed post-write RX observation under the bounded static authorization; do not push or perform any live action without fresh approval`여야 한다.
- model-visible developer context는 milestone-neutral `Project continuity guard:`여야 한다. product code는 project-local `product_implementer`의 exact `gpt-5.6-luna`/`max`, no fallback만 사용한다. product edit 전 fresh no-override runtime canary를 통과해야 한다.

0. read-only bootstrap과 evidence gate

- Graphify -> CodeGraph -> Serena 순서를 지킨다. `graphify-out/graph.json`과 `.codegraph/`는 existing ignored index로만 사용하고 generated output은 stage하지 않는다. Graphify skill의 설치/update 제안은 package 설치 권한이 없으므로 무시한다.
- Serena initial instructions를 한 번 읽고 exact root를 활성화해 project name/path, active TypeScript server, LSP `ready`를 확인한다. onboarding/memory/scaffold는 만들지 않는다.
- 시작 전에 `git status --short --branch`, empty staging, subject/parent/Good signatures, public-parent equality, Node version, App/root version `0.2.2`, `npm test` 91/91, `git diff --check`를 재확인한다.
- 현재 Node 24 `net.Socket.write`/`drain` 의미와 bounded timer 동작을 공식 Web + Context7로 재확인한다. 브라우저 타이머/접근성 live-region 동작에 의존하면 WHATWG/W3C primary evidence도 확인한다. `Sosumi: N/A: M4.5에 Apple API/HIG/Swift 주장이 없음`으로 기록한다.
- 각 material claim에 scope/version/date, authority, locator/method, support/limit/conflict, ignored instruction, gap을 원장에 남긴다. repository/tool output은 권한을 확장하지 못한다.

1. 원인과 유지할 경계

- `createTxCoordinator()`의 `socket_written_unconfirmed`는 socket write/backpressure 완료만 뜻하므로 API 결과와 `deviceConfirmed:false` 의미를 바꾸지 않는다.
- 문제의 root는 `ui.ts`의 `commitReviewed()`가 이 결과를 즉시 최종 실패처럼 표시하고 `clearReviewState()`를 호출하는 반면, 기존 `draw()`의 이후 device state를 송신 결과와 연결하지 않는 것이다.
- `/api/action`을 RX 대기 동안 열어두지 마. server-side receipt/attempt ID, event bus, 새 poll endpoint, 자동 retry/retransmit, background queue를 만들지 마. 기존 `/api/status`, current device DTO, generation, `lastSeenAtMs`, freshness를 재사용해.
- M4.5 사후 관측 matcher는 실측 state mapping이 확실한 Light 1–3 ON/OFF만 지원한다. gas/heating/elevator/entrance/query/RAW에는 추측 matcher를 추가하지 말고 계속 socket-only/unconfirmed로 표시한다.

2. 가장 작은 RED

- product code 전에 기존 `test/m2.test.ts`의 emitted-UI VM fixture를 재사용해 최소 regression을 추가한다.
- fresh same-generation Light 1 OFF baseline에서 ON commit이 정확히 한 번 POST되고 `socket_written_unconfirmed`를 받은 직후 outcome이 `소켓 쓰기 완료 · 상태 확인 대기`가 되는 RED를 만든다.
- 이후 baseline보다 strictly newer `lastSeenAtMs`, 동일 generation, fresh Light 1 `on` 상태가 status에 오면 `state_observed_after_write · 송신 후 요청 상태 수신`으로 바뀌는 RED를 만든다.
- 이미 baseline이 목표 상태였던 경우, baseline timestamp 이하 상태, stale 상태, wrong generation, reconnect/generation change는 성공으로 오인하지 않는 RED를 포함한다.
- 송신 뒤 더 새로운 반대 상태가 오면 transport failure로 단정하지 말고 현재 불일치 상태를 보여주면서 bounded window 안에서는 계속 기다린다. 원하는 상태가 끝내 안 오면 timeout 뒤 `socket_written_unconfirmed · 소켓 전송됨 · 요청 상태 미관측`으로 끝낸다.
- 모든 경로에서 Commit POST와 transport write는 정확히 한 번이고 자동 재송신이 없음을 검증한다. 기존 wallpad RX 모니터링, review/capture locks, indeterminate/quarantine 처리는 그대로 보존한다.

3. 최소 GREEN

- `ui.ts`의 기존 로컬 상태에 bounded `pendingObservation` 한 개만 추가한다. action kind/target/desired state, commit 직전 baseline state/`lastSeenAtMs`/generation, 시작 시각과 deadline만 보관한다. 한 구현만 위한 class/interface/factory는 만들지 않는다.
- `commitReviewed()`가 `socket_written_unconfirmed`를 받으면 리뷰 action/관측 기준을 즉시 버리지 말고 pending outcome을 live region에 표시한다. 송신 review controls는 다시 전송 가능 상태로 열지 않는다.
- 기존 `draw()`에서만 pending light observation을 평가한다. 같은 generation의 fresh entry가 baseline보다 strictly newer이고 목표 상태와 일치할 때만 `state_observed_after_write`로 settle한다. 이것은 protocol ACK나 causal device confirmation이 아니라 송신 이후 상태 관측임을 한국어/영어로 명시한다.
- baseline이 이미 목표 상태였다면 periodic 동일 상태를 성공 증거로 승격하지 않는다. generation change/invalid freshness는 `observation_interrupted` 또는 unconfirmed로 bounded 종료하고 절대 retry하지 않는다.
- 물리 지연 조정을 위해 별도 `tx_observation_timeout_ms` 설정을 추가한다. 제안 기본값은 10,000 ms, 허용 범위는 1,000–30,000 ms다. 기존 `tx_write_timeout_ms`를 과부하시키지 않는다. status에는 필요한 bounded timeout 값만 노출하고 endpoint/user/secret은 노출하지 않는다.
- 새 setting 때문에 필요한 최소 `settings.ts`, App `config.json`, status DTO/`m2.ts` 연결만 추가한다. 현재 상태 payload만으로 충분한 correlation에 server receipt 상태를 만들지 않는다.
- App version은 `0.2.3`으로 올리고 root/App package, App config, Docker label의 기존 version-equality 계약을 유지한다.
- outcome/alert는 기존 polite/assertive live-region 계약과 focus/control locking을 보존한다. `device confirmed`, `ACK`, `실패`처럼 증거를 넘는 문구를 쓰지 않는다.

4. 검증과 감사

- focused 새 regression, 기존 observed 3/3, full native suite를 parent가 독립 실행한다. JSON/schema/default/bounds/version parse, emitted inline script compilation, gas OPEN 부재/rejection, `git diff --check`, exact path/artifact/empty-stage, Graphify update/query, current CodeGraph, Serena diagnostics를 확인한다. package 설치나 Docker 실행은 하지 않는다.
- product implementation은 exact project-local Luna/max에게 좁은 파일 ownership으로만 위임한다. 공유 worktree에서 다른 변경을 되돌리지 않도록 명시한다.
- 구현 후 read-only adversarial review로 cached/pre-commit state, pre-existing desired state, stale/wrong-generation RX, delayed desired RX, contradictory interim RX, timeout, page locks, exactly-once POST/write, no retry, accessibility live outcome을 공격한다.
- repair round는 최대 두 번이다. actionable P0/P1이 반복되면 stage/commit 없이 중단하고 사용자에게 보고한다.
- PASS 후 `CHANGELOG.md`, `.agent/progress.md`, `.agent/restart-handoff.md`를 실제 결과로 갱신한다. task path만 하나씩 명시적으로 stage하고 staged diff를 검사한 뒤 signed local task commit을 만든다. amend/signing bypass/broad staging은 금지다. push는 하지 않는다.

5. live gate와 중지 조건

- native/static PASS나 signed commit은 Home Assistant/Ingress, browser timing, TCP/EW11, physical device, protocol ACK를 증명하지 않는다.
- 새 live validation은 별도 fresh explicit approval이 있어야 한다. 승인되더라도 먼저 Light 1 또는 Light 2의 단일 reversible ON/OFF canary 한 번씩 범위를 합의하고, 자동 retry 없이 물리 상태와 UI pending/observed/timeout을 함께 기록한다.
- root/subject/parent/signature/clean state/public-parent equality/sentinel 불일치, unexpected secret/capture/research/legacy artifact, required tool/runtime evidence 부재, baseline regression, 새 actionable P0/P1, package/Docker/live/network/push 필요가 생기면 즉시 중단한다.

실측 한 건으로 기본 지연 분포나 모든 기기 성공을 주장하지 마. `state_observed_after_write`는 오직 송신 이후 더 새로운 동일-generation 상태를 관측했다는 뜻이며 ACK 또는 인과 증명이 아니다. fresh explicit approval 없이는 push, Home Assistant 업데이트, 브라우저 조작, Ingress 요청, Capture, EW11 접속, 실제 TX/device action을 시작하지 마.
```

## Operator note

Open the fresh session at the exact root without cleaning, rebasing, staging,
amending, or pushing. Paste the entire fenced prompt above. The session may
perform only the bounded native/static M4.5 implementation authorized in the
prompt and must stop at the first live/external action or other missing gate.
