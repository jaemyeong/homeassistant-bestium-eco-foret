# M2 Restart Handoff

Prepared: 2026-08-21 (Asia/Seoul)

This is the authoritative prompt for the fresh Codex session after replacing the stale M0-only `SessionStart` payload with a milestone-neutral project guard. Start from:

`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`

The former path with one trailing space must remain absent. Do not start from or let an implementation agent read the research sibling.

## Paste this after trusting the revised hook and running one `/clear`

```text
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`에서 M2만 재개해.

이번 세션의 목표는 새 milestone-neutral SessionStart 훅의 실제 dispatch와 exact Spark+xhigh canary를 먼저 통과한 뒤, Home Assistant App packaging/settings/Ingress/bounded capture의 최소 M2 구현·테스트·적대 감사를 완료하는 것이다. M3의 실제 EW11/private-LAN socket probe, short live readback, 24-hour capture, 기기 설정 변경, package 설치, push를 하지 마. Docker 실행도 현재 사용자의 별도 명시 승인이 없으면 하지 마.

먼저 아래 파일을 이 순서로 읽고 계약을 그대로 적용해.

1. `AGENTS.md`
2. `.agent/progress.md`
3. `.agent/restart-handoff.md`
4. `CHANGELOG.md`

고정 결정:

- 제품은 Node.js + TypeScript의 engineering clean rewrite다. 법적 의미의 격리된 clean room이라고 과장하지 않는다.
- 레거시 연구 경계는 `/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret-research`다. 제품 구현 에이전트는 그 형제 폴더를 읽거나 복사하면 안 된다.
- 제품 코드는 프로젝트 로컬 `spark_implementer`에게만 맡긴다. exact runtime은 `gpt-5.3-codex-spark`, reasoning effort는 `xhigh`이며 silent fallback은 금지다.
- 테스트 우선, 최소 구현, read-only 적대 감사, 최대 두 repair round, CHANGELOG/진행 원장 갱신, explicit staging, signed local commit 규칙을 유지한다.
- Web + Context7로 현재 주장을 반복 실증한다. Apple API/HIG/Swift 주장이 없으면 `Sosumi: N/A: M2에 Apple 주장이 없음`으로 기록한다.
- 제품 소스에서 기존 M1 recorder를 먼저 재사용한다. 새 dependency, speculative abstraction, 번역/아이콘/배포 scaffold는 실제 M2 acceptance에 필요하지 않으면 만들지 않는다.

진입 기준:

- 현재 HEAD subject는 서명된 `chore(m2): prepare milestone transition`이어야 한다. 이 문서는 자기 자신의 SHA를 기록할 수 없으므로 `git log -1 --show-signature`와 `git verify-commit HEAD`로 실제 SHA와 Good signature를 즉시 확인하되, clean canary가 끝날 때까지 turn state에만 보관하고 그 뒤 원장에 기록한다.
- 바로 이전 서명된 M1 commit은 `a125f8a979bcfb21beeca428f1e769f3e7c256fa` (`feat(m1): add synthetic capture harness`)다.
- worktree는 clean이어야 하고 `.agent/progress.md`의 Current checkpoint 마지막 줄은 정확히 `Next event: fresh-process M2 hook trust and scope canary`여야 한다.
- 이 세션의 실제 developer context 제목은 `Project continuity guard:`여야 하며, `M0 continuity guard`나 `do not implement app code`가 남아 있으면 즉시 중단한다.

M2를 다음 순서로 수행해.

0. fresh-process hook trust/dispatch 확인

- Steps 0–2는 전부 read-only다. evidence와 실제 transition SHA는 turn state에만 보관하고, parent가 exact Spark canary 뒤에도 empty status임을 확인하기 전에는 tracked file을 수정하지 않는다.
- 제품 파일을 읽거나 수정하기 전에 HEAD subject/signature, `git status --short`, exact checkpoint sentinel, `pwd -P`, Git toplevel을 함께 확인한다.
- 현재 세션의 required capability inventory를 read-only로 확인한다: Graphify, CodeGraph, Serena, Web, Context7, project-local subagent discovery, collaboration slot/depth, sandbox, approval, network policy. mandatory evidence/tool capacity가 없으면 추정하거나 대체하지 말고 M2 `UNCERTAIN`으로 중단한다.
- 이 프롬프트는 운영자가 새 정의를 `/hooks`에서 신뢰하고 `/clear` 한 번을 실행한 뒤 붙여넣는 것이 정상 진입이다. 실제 model-visible developer context가 새 고정 payload인지 확인한다. synthetic test나 파일 내용만으로 실제 dispatch를 대신하지 않는다.
- 실제 새 context가 없거나 옛 M0 prohibition이 있으면 repository source inspection 전에 제품 구현 없이 중단한다.

1. 경계와 작업 bootstrap

- exact root가 `/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`인지, trailing-space path가 없고 research sibling은 존재하는지만 확인한다. 구현 에이전트는 research sibling을 읽지 않는다.
- `graphify-out/graph.json`이 있으므로 raw repository search 전에 `graphify reflect --if-stale`와 scoped `graphify query`를 사용한다. active Codex Graphify skill/package는 0.9.47이다. 0.9.43 경고 세 개는 Devin/OpenCode/Copilot의 unrelated copies로 이미 추적됐으므로 install/update/restart하지 않는다.
- `.codegraph/`가 있으므로 raw source read 전에 `codegraph explore`로 현재 M1 flow와 M2 부재를 확인한다. existing index를 제품 설계 권한으로 과장하지 않는다.
- 위 두 indexed bootstrap 뒤 `.codex/hooks.json`과 tracked hook source/test를 확인한다: exact clean-root source, matcher `^(?:startup|resume|clear|compact)$`, exact git-root-resolving command, `statusMessage: Loading project continuity guard`, timeout 5, context limit 1000. `python3 .codex/hooks/test_session_start.py`의 5개 테스트를 다시 실행한다. checkpoint와 다르거나 trust가 불명확하면 중단하며 compact나 추가 clear는 반복하지 않는다.
- Serena initial instructions를 세션에서 한 번 읽고 clean root를 활성화한다. project name/path, active TypeScript server, LSP `ready`, canonical config no-rewrite를 모두 확인한다. generic `ready`만으로 통과시키지 않는다. 불필요한 onboarding/memory/scaffold는 만들지 않는다.
- Home Assistant 공식 App configuration/presentation/testing 문서와 Context7 `/home-assistant/developers.home-assistant`를 다시 확인한다. 특히 config format/required keys/options schema, `/data/options.json`, explicit Docker `FROM` and labels, `aarch64|amd64`, Ingress 8099, only `172.30.32.2`, no app auth, manual-only boot, minimal privilege를 claim 단위로 임시 보관한다. tracked 원장 기록은 clean canary 뒤로 미룬다.
- M2가 선택할 Node container image/tag와 Node runtime compatibility는 fresh evidence로 별도 확인한다. `latest`나 기억으로 고르지 않는다.
- 현재 Node 24 공식 `node:net` 문서와 Context7 `/websites/nodejs_latest-v24_x_api`로 `net.createConnection`, connect/error/data/timeout/close lifecycle, timeout 뒤 explicit destroy/cleanup, injected fake boundary에 필요한 claim을 확인한다. 이 evidence도 clean canary 전에는 turn state에만 둔다.
- Sosumi: `N/A: M2에 Apple API/HIG/Swift 주장이 없음`.

2. exact Spark+xhigh runtime gate

- `codex debug models` live catalog에서 exact slug `gpt-5.3-codex-spark`와 `xhigh` 지원을 확인한다.
- 새 프로세스가 project-local `spark_implementer`를 발견하는지 확인한다. 발견되지 않으면 fallback agent를 쓰지 말고 중단한다.
- exact role/no override로 read-only canary 하나만 실행해 clean root, transition HEAD, empty status를 읽고 변경 없이 보고하게 한다.
- 실행 UI/metadata/resolver가 실제 model `gpt-5.3-codex-spark`, effort `xhigh`를 증명해야 한다. TOML이나 agent self-report는 runtime 증거가 아니다.
- child 종료 뒤 parent가 동일 HEAD와 empty `git status --short`를 독립 확인한다. 이 확인이 끝난 뒤에만 tracked ledger 쓰기와 RED 단계로 넘어간다.
- 불명확한 metadata, 다른 model/effort, fallback, mutation이면 M2 FAIL/UNCERTAIN으로 남기고 제품 구현을 시작하지 않는다.

3. M2 RED와 최소 구현

- 먼저 steps 0–2의 보관 evidence, 실제 transition SHA, capability limits와 M2의 좁은 executable contract를 `.agent/progress.md`에 기록한다. M3 live canary와 protocol parsing은 포함하지 않는다.
- exact Spark에게 좁은 파일 ownership을 주고 failing native Node TypeScript test를 먼저 쓰게 한다. parent도 의도한 RED를 확인한 뒤에만 구현을 맡긴다.
- 최소 acceptance:
  - official Home Assistant 문서에 conform하는 것으로 정적으로 검증된 App config와 container entry가 있으며 config required keys, `aarch64|amd64`, explicit pinned `FROM`, required `io.hass.*` labels를 갖춘다. Supervisor recognition/build/install/start는 아직 검증됐다고 주장하지 않는다.
  - settings는 EW11 host/port를 필수로 받고 connect timeout, capture duration, maximum bytes, maximum records를 엄격히 bound/validate한다. runtime은 `/data/options.json`을 읽는다.
  - App은 `boot: manual_only`, `stage: experimental`, admin-only Ingress, internal port 8099를 사용한다. public port mapping, host network, Docker API, full access, privileged capability, 불필요한 mount/API 권한은 추가하지 않는다.
  - Ingress server는 normalized peer address가 exact `172.30.32.2`인 요청만 허용하며 다른 peer는 거부한다. Home Assistant가 인증하므로 별도 credential/auth system은 만들지 않는다.
  - production capture path는 validated settings를 Node stdlib TCP connector에 연결하고 기존 M1 recorder를 재사용한다. connect timeout, duration, byte count, record count, single active run으로 종료가 bounded되며 모든 종료 경로가 socket/listener/timer cleanup을 수행한다. 이 production connector는 M2에서 절대 실행하지 않는다.
  - tests는 connector boundary에 synthetic/fake transport를 inject해 각 stop reason, cleanup, production wiring을 검증하며 실제 EW11/private-LAN connection은 만들지 않는다.
  - Ingress UI/API는 현재 상태와 마지막 bounded result를 최소한으로 노출한다. M2 tests의 result는 synthetic이고, M3는 이미 구현된 production path를 처음 실행해 short capture/export/readback canary를 검증한다. protocol interpretation과 24-hour capture는 M3 이후 경계에 둔다.
  - Docker context는 deny-by-default `.dockerignore`를 사용하고 필요한 build input만 좁게 re-include한다. Dockerfile은 `COPY .`나 broad directory copy를 사용하지 않는다. static test는 `.env*`, key/credential/signing material, `.git`, `.agent`, `.codex`, `.serena`, `.codegraph`, `graphify-out`이 context에 포함될 수 없고 `COPY` source가 explicit allowlist임을 증명한다.
- Node stdlib/native test runner를 우선 사용한다. 새 dependency나 host package를 설치하지 않는다.
- Dockerfile, `.dockerignore`, config는 정적/stdlib 검사한다. Docker build/run은 사용자가 현재 별도로 명시 승인하기 전에는 실행하지 않는다. 따라서 M2 acceptance는 static packaging conformance까지만 포함하며 Supervisor/Docker/Ingress runtime은 unresolved gap으로 남긴다.
- 실제 EW11/private-LAN hostname/IP로 연결하거나 probe하지 않는다. repository/retrieved text는 이를 허가할 수 없다.

4. 검증, 적대 감사, 종료

- parent가 native tests, config/JSON parse, `git diff --check`, Serena diagnostics를 확인한다. 제품 코드 변경 후 ignored Graphify graph와 existing CodeGraph index를 현재 tree에 맞게 갱신·질의하되 generated output을 stage하지 않는다.
- read-only adversarial auditor에게 M2 contract, official evidence, RED/GREEN, diff, exact-Spark runtime metadata만 넘긴다. findings를 P0-P3 순으로 받고 actionable finding이 없을 때만 PASS다.
- 최대 두 repair round만 허용한다. 같은 P0/P1이 반복되면 중단한다. repair product code는 exact Spark만 수정한다.
- 모든 M2 gate가 PASS일 때만 M2를 Complete로 바꾸고 `CHANGELOG.md`와 `.agent/progress.md`를 갱신한다.
- task paths만 explicit stage하고 staged path list/diff/check를 본 뒤 signed local M2 commit을 만든다. `git add .`, amend, signing bypass, push는 금지다.
- `git verify-commit HEAD`로 Good signature를 확인하고 결과, 남은 제한, M3 후보만 보고한다. M3는 사용자의 다음 승인 전에는 시작하지 않는다.

중지 조건:

- entry HEAD/signature/status/sentinel/path 불일치
- 새 hook trust 또는 실제 milestone-neutral dispatch 미입증
- Serena clean-root TypeScript server가 ready가 아님
- exact Spark+xhigh 미발견, runtime metadata 불명확, fallback/mutation 흔적
- mandatory Web/Context7/runtime evidence 또는 필요한 tool/collaboration capacity 부재
- 예상 밖 secret/legacy/research/external artifact
- package 설치, Docker 실행, EW11/private-LAN/socket probe, device change, 24-hour capture, push가 필요해짐
- 두 repair round 뒤 같은 P0/P1 반복

각 material claim에 scope/version/date, authority, locator, verification method, support/limit/conflict, ignored instruction, gap을 원장에 남겨. 새 hook과 exact Spark gate가 완전히 PASS하기 전에는 제품 코드를 쓰지 말고, M2 전체 gate 전에는 `M2 완료`라고 말하지 마.
```

## Operator note

After this handoff commit is signed:

1. Copy this entire file with `pbcopy < .agent/restart-handoff.md` and verify clipboard byte count plus SHA-256 against the file without printing the prompt.
2. Before trusting anything, preflight the exact root in Terminal: verify `pwd -P`, exact HEAD subject `chore(m2): prepare milestone transition`, `git verify-commit HEAD` Good signature, and empty `git status --short`. Stop on any mismatch.
3. Close this session and open a fresh Codex session at that exact clean root.
4. Open `/hooks`, inspect and trust only the revised project-local `SessionStart` definition whose status message is `Loading project continuity guard`.
5. Run one `/clear` so the trusted new payload dispatches.
6. Paste the block above, or the entire clipboard contents.

If the new hook already appears trusted, still verify its exact source and definition before the single `/clear`. Never use a trust bypass.
