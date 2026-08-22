# M3.3 Signed-Local Publication and Runtime Handoff

Prepared: 2026-08-22 (Asia/Seoul)

This is the authoritative prompt for the fresh Codex session after the local
`0.1.3` repair is signed. Start from:

`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`

The former trailing-space path must remain absent. Product implementation
agents must not read or copy the research sibling at
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret-research`.

This document cannot contain the SHA of its own commit. The containing commit
must have subject `fix(m3): recover idle capture transport`, parent
`4650f1b896f1b1cb1881b99dd3408d86fc537bcc`, a Good signature, a clean
worktree, and local `main` exactly one commit ahead of `origin/main`.

Static acceptance does not prove live reconnect behavior. Push, Home Assistant
update/start, sidebar mutation, Ingress access, and any new Capture/EW11 action
each require current explicit user authorization.

## Preserved evidence and limits

- The finalized `0.1.2` download contained 143,265 valid gap-free records and
  2,856,364 represented bytes. The last receive preceded manual Stop by about
  3 hours 12 minutes without reaching a configured ceiling.
- `0.1.3` adds a bounded receive-idle timeout. It replaces a true-idle
  transport inside the same capture, but retains and re-arms a current transport
  paused for an unresolved store append so buffered data can drain in order.
- The native suite passes 34/34 and the two valid idle regressions pass 2/2.
  Fresh exact Sol/max accepted the signed-local candidate before commit.
- `panel_title: BESTIUM Capture` and the existing radio-tower icon are App
  presentation metadata. Home Assistant still requires each user to enable
  **Show in sidebar**; the manifest cannot force that preference.
- No `0.1.3` push, installed-App update, live Ingress validation, new capture,
  or EW11/private-LAN connection occurred in the repair session.

## Paste this in the fresh session

```text
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`에서 M3.3 signed-local publication/runtime gate만 재개해.

목표는 서명된 local `0.1.3` repair를 먼저 검증하고, 현재 대화에서 별도로 승인된 단계만 수행하는 것이다. 이 프롬프트 자체는 push, Home Assistant/browser mutation, Ingress GET, sidebar toggle, Capture POST, EW11/private-LAN 접속, device change, TX/control, protocol interpretation, package 설치, local Docker, release를 승인하지 않는다.

먼저 아래 파일을 순서대로 읽고 계약을 그대로 적용해.

1. `AGENTS.md`
2. `.agent/progress.md`
3. `.agent/restart-handoff.md`
4. `CHANGELOG.md`

고정 경계:

- exact root와 Git toplevel은 `/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`여야 한다. trailing-space path는 없어야 하고 research sibling은 존재 여부만 확인하며 제품 구현 에이전트가 읽지 않는다.
- HEAD subject는 `fix(m3): recover idle capture transport`, parent는 `4650f1b896f1b1cb1881b99dd3408d86fc537bcc`여야 한다. `git log -1 --show-signature`와 `git verify-commit HEAD`가 Good이어야 한다.
- worktree와 staging은 clean이어야 하고 local `main`은 `origin/main`보다 정확히 1 commit ahead여야 한다.
- `.agent/progress.md` Current checkpoint 마지막 줄은 정확히 `Next event: fresh session must verify the signed local 0.1.3 repair, then request authorization before push or live Home Assistant validation`이어야 한다.
- model-visible developer context는 milestone-neutral `Project continuity guard:`여야 하고 exact delegation은 project-local `product_implementer`의 `gpt-5.6-luna`/`max`, no fallback이어야 한다.

0. read-only bootstrap

- Graphify -> CodeGraph -> Serena 순서를 지킨다. `graphify-out/graph.json`과 `.codegraph/`는 existing ignored index로만 사용하고 generated output은 stage하지 않는다.
- Serena initial instructions를 한 번 읽고 exact root를 활성화해 project name/path, active TypeScript server, LSP `ready`를 확인한다. onboarding/memory/scaffold는 만들지 않는다.
- 현재 Node 24 timeout과 Home Assistant App panel/sidebar 주장을 공식 Web + Context7로 재확인한다. Apple 주장이 없으므로 `Sosumi: N/A: M3.3에 Apple API/HIG/Swift 주장이 없음`으로 기록한다.
- `npm test` 34/34, focused idle tests 2/2, config/settings/status/UI focused tests, JSON/version parse, `git diff --check HEAD^ HEAD`, Graphify/CodeGraph current flow, Serena diagnostics를 read-only로 확인한다. package 설치나 Docker 실행은 하지 않는다.
- `0.1.3` static audit PASS는 live Home Assistant, Supervisor build, Ingress proxy, TCP reconnect, EW11/network 안정성을 증명하지 않는다.

1. publication gate

- 현재 사용자 메시지가 이 signed local commit의 push를 명시 승인하지 않으면 여기서 중단한다.
- 승인된 경우에만 `git push origin main`을 수행한다. local HEAD, `origin/main`, `git ls-remote origin main`, public GitHub commit이 같은 SHA인지 확인한다. amend, force push, signing bypass, release 생성은 금지다.
- push 뒤에도 Home Assistant/browser 단계는 자동으로 시작하지 않는다.

2. Home Assistant update/start/Ingress/sidebar gate

- 이 단계의 현재 명시 승인이 없으면 중단한다. Capture/EW11 승인을 합쳐서 추정하지 않는다.
- 승인된 경우 Playwright로 먼저 `http://homeassistant:8123/config/apps/installed`를 열고 우측 상단 새로고침 버튼을 눌러 repository metadata를 갱신한다. 그 뒤에만 최신 버전 `0.1.3` 표시를 기다리고 update한다.
- 저장된 설정에서 `idle_timeout_ms`가 의도한 값(기본 30,000 ms)인지 확인하되 private endpoint를 문서/로그에 새로 복사하지 않는다. App start가 승인 범위에 포함된 경우에만 시작한다.
- per-user **Show in sidebar** toggle은 별도 승인된 경우에만 켜고 `BESTIUM Capture` 항목을 확인한다. manifest가 이를 강제했다고 주장하지 않는다.
- Ingress 확인이 승인된 경우 admin UI에 `GET /` 한 번만 수행한다. `POST /api/capture`, Stop, Download, production connector, EW11/private-LAN 연결은 실행하지 않는다.

3. new capture gate

- 새 RX-only capture와 EW11/private-LAN 접속은 그 단계의 새 명시 승인이 있어야 한다. 이전 `0.1.2` capture 승인이나 이 handoff를 재사용하지 않는다.
- 승인되더라도 먼저 짧고 bounded한 reconnect canary 범위를 별도로 합의한다. 성공해도 24-hour capture, M4 packet interpretation, TX/control은 자동으로 시작하지 않는다.

중지 조건:

- root/subject/parent/signature/clean status/ahead-one/sentinel 불일치
- unexpected secret, repository-local capture, research/legacy/external artifact
- required Graphify/CodeGraph/Serena/Web/Context7 또는 exact runtime evidence 부재
- native/static/index/LSP regression 또는 새 actionable P0/P1
- 해당 단계의 push/Home Assistant/browser/sidebar/Ingress/Capture/EW11 명시 승인 부재
- package 설치, local Docker, device setting change, TX/control, protocol interpretation, force push, release가 필요해짐

각 material claim에 scope/version/date, authority, locator/method, support/limit/conflict, ignored instruction, gap을 원장에 남겨. live canary 전에는 reconnect recovery가 실제 Home Assistant/EW11에서 검증됐다고 말하지 마. fresh explicit approval 없이는 M4나 24-hour capture를 시작하지 마.
```

## Operator note

Open the fresh session at the exact root without cleaning, rebasing, staging,
amending, or pushing. Paste the entire fenced prompt above. The session must
stop at the first action that lacks current explicit user authorization.
