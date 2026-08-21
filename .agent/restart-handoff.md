# M3.2 Capture Finalization Resume Handoff

Prepared: 2026-08-22 (Asia/Seoul)

This is the authoritative prompt for the fresh Codex session after the single
authorized bounded RX-only capture reaches a terminal state. Start from:

`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`

The former path with one trailing space must remain absent. Do not start from or
let a product implementation agent read the research sibling at
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret-research`.

The signed product baseline is
`791fe4e597bfd7a1f294bc54fa519a59b9b4a1cc`
(`feat(m3): add persistent capture dashboard`). This handoff is committed by a
later signed documentation commit whose SHA must be derived live rather than
recorded inside itself.

The existing capture started at 2026-08-22 01:40:48 Asia/Seoul with these exact
ceilings: 86,400,000 ms, 67,108,864 bytes, and 1,000,000 records. A privacy-cropped
Playwright screenshot observed it still `Running` at 515,467 ms with 55,206 bytes
and 2,760 records. The screenshot intentionally excludes the private endpoint,
Home Assistant account identity, and packet preview.

## Paste this in the fresh session

```text
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`에서 M3.2의 기존 단일 캡처 종료 검증만 재개해.

목표는 새 캡처를 시작하는 것이 아니라, 이미 2026-08-22 01:40:48 Asia/Seoul에 시작된 App `0.1.2`의 단일 bounded RX-only 캡처가 종료된 뒤 finalization과 Download를 실제 UI에서 검증하고, 캡처 파일을 공개 저장소 밖에 안전하게 내려받아 구조적 무결성만 확인한 다음 M3.2 종료 원장을 준비하는 것이다. 이 프롬프트만으로 M4 프로토콜 해석, legacy 비교, TX/control, EW11 설정 변경, package 설치, local Docker, release, 두 번째 캡처는 승인되지 않는다.

먼저 아래 파일을 순서대로 읽고 계약을 그대로 적용해.

1. `AGENTS.md`
2. `.agent/progress.md`
3. `.agent/restart-handoff.md`
4. `CHANGELOG.md`
5. `README.md`

진입 기준:

- exact root와 Git toplevel은 `/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`여야 한다.
- HEAD subject는 서명된 `docs: add README and capture handoff`여야 한다. 이 문서는 자기 SHA를 기록할 수 없으므로 `git log -1 --show-signature`와 `git verify-commit HEAD`로 실제 SHA와 Good signature를 확인한다.
- HEAD의 부모는 `791fe4e597bfd7a1f294bc54fa519a59b9b4a1cc`여야 하고, local `main`, `origin/main`, `git ls-remote origin main`이 같은 SHA여야 한다.
- worktree와 staging은 clean이어야 한다. capture NDJSON이나 browser download가 repository 안에 있으면 즉시 중단한다.
- `.agent/progress.md`의 Current checkpoint 마지막 줄은 정확히 `Next event: fresh session must inspect the existing single capture terminal result and Download without starting another capture`여야 한다.
- 실제 developer context는 milestone-neutral `Project continuity guard:`여야 한다. hook definition이 바뀌었거나 trust가 불명확하면 제품/브라우저 작업 전에 중단한다.

다음 순서로 수행해.

0. read-only bootstrap

- HEAD/signature/status/sentinel, `pwd -P`, Git toplevel, trailing-space path 부재만 확인한다. research sibling은 존재 여부만 보고 내용을 읽지 않는다.
- `graphify-out/graph.json`이 있으므로 scoped `graphify query`를 raw repository search보다 먼저 실행한다. 그 다음 existing `.codegraph/`에 `codegraph explore`를 사용한다. generated output은 stage하지 않는다.
- Serena initial instructions를 세션에서 한 번 읽고 exact root를 활성화해 project path, active TypeScript server, LSP `ready`를 확인한다. onboarding이나 memory/scaffold를 만들지 않는다.
- 현재 Home Assistant App/Ingress/Download 주장은 공식 Web과 Context7로 다시 확인한다. Apple 주장이 없으므로 `Sosumi: N/A: M3.2 종료 검증에 Apple API/HIG/Swift 주장이 없음`으로 기록한다.

1. 기존 캡처 상태 확인

- Chrome의 현재 Home Assistant 로그인 상태를 사용하고 Playwright로 App `0.1.2` 정보와 Ingress를 연다. credential/cookie/local storage는 읽지 않는다.
- `Start`를 절대 누르지 않는다. 캡처가 이미 `Running`이면 두 번째 캡처를 시작하거나 임의로 Stop하지 말고 현재 elapsed/bytes/records/bounds만 보고한 뒤 사용자 지시를 기다린다.
- terminal 상태면 phase/reason/start/finish/elapsed/bytes/records/file name/file size와 exact configured bounds를 fresh DOM에서 기록한다. 과거 `0.1.0` EACCES 로그를 현재 실패로 오인하지 않는다.
- terminal인데 finalization 중이면 짧게 poll하되 60초 이상 사용자 update 없이 기다리지 않는다. 같은 동작을 반복하지 않는다.

2. finalized Download 검증

- finalized file이 표시되고 Download가 활성화된 경우에만 Download를 정확히 한 번 누른다. 비활성화됐거나 file이 없으면 추정하지 말고 `UNCERTAIN`으로 중단한다.
- 다운로드 파일은 repository 밖에 둔다. repository, Git history, GitHub, 채팅 본문, App 로그에 raw capture 전체나 private endpoint를 넣지 않는다.
- SHA-256, byte size, line count, UTF-8/NDJSON parse, 각 line의 `sequence`, `receivedAtMs`, `byteLength`, lowercase `hex` 형태, sequence monotonicity, decoded hex byte length equality를 stdlib read-only 검사한다. 전체 payload를 출력하지 않고 bounded metadata와 오류 개수만 보고한다.
- 캡처가 `maximum_bytes`, `maximum_records`, `duration`, user `stopped`, `closed`, `error` 중 어떤 reason으로 끝났는지 실제 result로만 기록한다. download 성공은 protocol correctness나 frame boundaries를 증명하지 않는다.

3. M3.2 종료 준비

- 실제 terminal/download evidence, capability limits, source scope/version/date/authority/locator/method/support-limit-conflict/ignored instruction/gap을 `.agent/progress.md`와 `CHANGELOG.md`에 기록한다.
- read-only adversarial review가 no actionable P0-P3일 때만 M3.2 runtime gate를 Complete로 표시한다.
- 문서-only closure 변경은 explicit path만 stage하고 staged diff/check를 본 뒤 signed local commit을 만든다. amend나 broad `git add .`를 쓰지 않는다.
- 이 프롬프트는 새 closure commit의 push를 자동 승인하지 않는다. `git verify-commit HEAD` Good signature까지 확인한 뒤 push와 M4 protocol analysis는 사용자에게 별도 승인을 요청한다.

중지 조건:

- entry HEAD/signature/status/sentinel/root/remote 불일치
- 기존 캡처 외 새로운 Start/POST가 필요함
- capture가 아직 Running인데 사용자가 Stop을 명시하지 않음
- finalized Download가 없거나 parse/integrity가 실패함
- capture 파일이 repository에 들어왔거나 secret/private data 공개 위험이 생김
- package, local Docker, EW11 setting/device change, TX/control, release, 두 번째 capture가 필요함

M3.2 완료와 protocol correctness를 혼동하지 마. M4 분석은 raw TCP read chunk가 protocol frame이라는 가정 없이 별도 evidence gate와 사용자 승인으로 시작한다.
```

## Operator note

1. Wait until the existing capture has reached a terminal state, or decide to
   stop it early in the Ingress UI.
2. Open a fresh Codex session at the exact root without cleaning or moving any
   browser download into the repository.
3. Verify the project-local `SessionStart` hook remains trusted and its status is
   `Loading project continuity guard`.
4. Paste this entire file from the clipboard. Do not run a trust bypass and do
   not start another capture.
