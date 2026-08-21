# M0 Restart Handoff

Prepared: 2026-08-21 (Asia/Seoul)

This is the authoritative prompt for the first fresh Codex session after M0.3. Start that session from:

`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`

The former path with one trailing space must remain absent. Do not start from the research sibling.

## Paste this into the fresh session

```text
`/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`에서 M0.4만 재개해.

이번 세션의 목표는 M0 런타임 canary와 최종 적대 감사뿐이다. 아직 Home Assistant App 제품 코드, package 설치, Docker build, EW11/private-LAN 접속, socket probe, 기기 설정 변경, push를 하지 마. M0가 PASS하기 전에는 M1도 시작하지 마.

먼저 아래 파일을 이 순서로 읽고 계약을 그대로 적용해.

1. `AGENTS.md`
2. `.agent/progress.md`
3. `.agent/restart-handoff.md`
4. `CHANGELOG.md`

고정 결정:

- 제품은 Node.js + TypeScript로 새로 작성한다.
- 기존 구현은 제품 소스에서 읽거나 복사하지 않는 engineering clean rewrite다. 법적 의미의 격리된 clean room이라고 과장하지 않는다.
- 레거시 연구 경계는 `/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret-research`다. 구현 에이전트는 이 형제 폴더를 읽으면 안 된다.
- 미래 제품 코드는 프로젝트 로컬 `spark_implementer`에게만 맡기며 정확한 모델은 `gpt-5.3-codex-spark`다. silent fallback은 금지다.
- M0.4에서도 제품 코드는 작성하지 않는다. 정확한 모델의 read-only canary만 수행한다.
- Web + Context7로 현재 주장을 반복 실증한다. Sosumi는 Apple 주장에만 사용하고 이번 M0.4에는 `N/A: Apple 주장 없음`으로 기록한다.
- 테스트 우선, read-only 적대 감사, CHANGELOG/진행 원장 갱신, explicit staging, signed commit 규칙을 유지한다.

이미 완료되고 서명 검증된 커밋:

- `a47a85bf86a685e583042527fd908fc7e4b82d7f` — `chore(m0): isolate legacy research workspace`
- `e3fb4acb108e8c353f5b26c056049cc483364da2` — `chore(m0): add session continuity guard`
- `1b87afee93a8c2c8081e50aed78db090be5d96c9` — `chore(m0): configure TypeScript implementation agent`

이 핸드오프를 추가한 현재 HEAD는 서명된 `docs(m0): prepare restart handoff` 커밋이어야 한다. 이 문서는 자기 자신의 SHA를 기록할 수 없으므로 `git log -1 --show-signature`로 실제 SHA와 Good signature를 확인해 원장에 기록해.

보존된 레거시 HEAD:

- `HomeNetwork`: `a1d6ba5167586ad1136a2145e54e4e1d1d4533f8`
- `homeassistant-addons`: `903cc87c1c1709f076a50eab9c2c316325b9c988`

현재 구성:

- `.codex/hooks.json`: `startup|resume|clear|compact`만 허용하는 `SessionStart` 훅
- `.codex/hooks/session_start.py`: 고정 bootstrap context만 출력하며 입력, transcript, 환경 변수를 반사하지 않음
- `.codex/hooks/test_session_start.py`: 5개 unittest, 네 source와 malformed/non-string/secret 비반사를 포함
- `.codex/agents/spark_implementer.toml`: exact Spark + medium, fallback 없음
- `.serena/project.yml`: clean project name + `language_servers: ["typescript"]`만 둔 최소 설정
- `graphify-out/`: 전역 Git 훅이 만든 ignored M0 control-plane graph. 제품 그래프가 아니며 제품 설계 근거로 쓰지 않음
- `.codegraph/`: 없음. 제품 TypeScript가 생기기 전에는 새 인덱스를 만들지 않음

M0.2 정적 hook 감사는 PASS했다. M0.3 custom-agent 정적 계약에는 actionable finding이 없었지만 전체 판정은 runtime canary 전까지 UNCERTAIN이다. 아직 입증되지 않은 것은 project hook definition trust/실제 lifecycle dispatch, clean-path Serena TypeScript readiness, 새 프로세스의 custom-agent discovery, 실제 runtime model이다. 설정 파일이나 에이전트 자기보고만으로 PASS 처리하지 마.

M0.4를 다음 순서로 수행해.

0. M0.4 진입 모드 결정

- 다른 gate보다 먼저 현재 HEAD subject/signature, `git status --short`, `.agent/progress.md`의 `M0.4 clear checkpoint` 절을 함께 확인한다.
- HEAD가 서명된 `docs(m0): prepare restart handoff`이고 worktree가 clean이며 clear checkpoint sentinel이 없으면 `initial restart` 모드다.
- 같은 HEAD를 유지하면서 `git status --short`가 정확히 ` M .agent/progress.md` 하나이고 clear checkpoint의 마지막 줄이 정확히 `Next event: clear`이면 `post-clear` 모드다.
- 두 패턴 중 정확히 하나와 일치해야 한다. 다른 HEAD, 추가 dirty path, 누락되거나 다른 sentinel은 예상 밖 상태이므로 중단한다.
- `initial restart`는 아래 순서를 처음부터 진행한다. `post-clear`는 부트스트랩을 다시 실행하되 원장의 완료 증거를 읽고, step 3의 clear event 확인부터 재개한다. 완료된 canary를 재구성하거나 다시 성공했다고 가정하지 않는다.

1. 경로와 Git 경계 확인

- `pwd -P`와 `git rev-parse --show-toplevel`이 정확히 `/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`인지 확인한다.
- `/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret `가 없고 research sibling이 존재하는지 확인한다.
- `initial restart`에서는 worktree가 clean인지 확인한다. `post-clear`에서는 step 0의 expected-dirty 원장 한 파일만 유지되는지 확인한다.
- 위 세 커밋과 현재 handoff 커밋을 `git verify-commit`으로 검증한다.
- 선택된 진입 모드와 다른 dirty 상태, path collision, 서명 실패가 있으면 즉시 중단한다.

2. 작업 부트스트랩

- `graphify-out/graph.json`이 있으므로 raw search 전에 현재 M0 상태를 `graphify query`로 질의한다. Graphify 0.9.47과 설치된 0.9.43 skill의 버전 경고는 기록하되 package 설치나 skill update는 M0에서 하지 않는다.
- `.codegraph/`가 없으므로 `CodeGraph: N/A — 제품 TypeScript가 아직 없음`을 기록한다. 생성하지 않는다.
- Serena initial instructions를 읽고 clean path를 활성화한다. `get_current_config`에서 프로젝트명이 `homeassistant-bestium-eco-foret`인지, 실제 경로가 clean root인지, TypeScript language server가 활성·ready인지 확인한다. generic `ready`만으로 통과시키지 말고 활성 서버가 TypeScript임을 확인한다. 현재 세션에서 남아 있던 trailing-space 등록 상태를 재사용하지 않는다.
- Serena onboarding은 M0.4 canary에 필수인 경우에만 수행하고, 불필요한 memory/scaffold를 만들지 않는다.
- OpenAI 공식 Hooks/Subagents 문서와 Context7 `/openai/codex`, Serena 공식 소스와 Context7 `/oraios/serena`를 다시 확인하고 claim 단위 증거를 원장에 기록한다.
- Sosumi는 `N/A: M0.4에 Apple API/HIG/Swift 주장이 없음`으로 기록한다.

3. SessionStart 신뢰와 실제 dispatch canary

- `/hooks`에서 프로젝트 `.codex/hooks.json`의 정확한 definition을 검토하고 clean-path 프로젝트에 대해 trust/enabled 상태를 확인한다. 정의가 다르거나 신뢰되지 않았다면 승인 없이 우회하지 않는다.
- `python3 .codex/hooks/test_session_start.py`를 다시 실행한다. 이 synthetic test는 필요하지만 실제 Codex dispatch의 증거를 대체하지 못한다.
- 이 fresh session의 `startup` 또는 `resume`에서 continuity context가 실제 추가되었는지 hook UI/event evidence로 확인한다. 모델이 “기억한다”고 말하는 것만으로 통과시키지 않는다.
- `initial restart`에서만 실제 `/clear` 직전까지 확보한 evidence와 통과한 gate를 `.agent/progress.md`의 `M0.4 clear checkpoint` 절에 기록하고, 마지막 줄을 정확히 `Next event: clear`로 둔다. 이것은 M0.4 안의 영속 checkpoint이지 별도 work unit이나 commit이 아니다. 이 시점의 예상 dirty 상태를 `.agent/progress.md` 하나로 제한하고 `git status --short`가 정확히 그 한 파일만 표시하는지 확인한다. HEAD는 서명된 `docs(m0): prepare restart handoff` 커밋에 그대로 둔다.
- `initial restart`에서 `.agent/restart-handoff.md`를 다시 `pbcopy`하고 사용자에게 `/clear` 한 단계만 요청한다. clear 후 사용자는 같은 handoff를 다시 붙여 넣는다. `post-clear` 진입 시 step 0의 HEAD, expected-dirty 원장, `Next event: clear` sentinel을 확인한 다음 `clear` canary부터 재개하며 다시 `/clear`를 요청하지 않는다. 이미 완료된 canary를 추측으로 재작성하지 않으며, 이 원장 변경은 최종 M0.4 work-unit commit에 포함한다.
- `clear`와 `compact` lifecycle을 실제 Codex event로 확인한다. 특히 `compact`는 다음 모델 요청 전에 context가 즉시 재주입되는지 확인한다.
- trust가 새 경로에서 설정되지 않아 시작 event를 놓쳤다면 원장에 정확한 gap을 기록하고, trust 후 한 번 더 재시작하도록 요청한다. synthetic 성공만으로 M0를 완료하지 않는다.

4. exact Spark discovery/runtime canary

- `codex debug models`의 live catalog에서 exact slug `gpt-5.3-codex-spark`와 `medium` 지원을 다시 확인한다.
- 새 프로세스가 프로젝트 로컬 `spark_implementer`를 발견하는지 확인한다. 발견되지 않으면 fallback agent를 쓰지 말고 중단한다.
- `spark_implementer`에게 read-only canary 하나만 맡긴다: 현재 clean Git root와 HEAD를 읽고 변경 없이 보고하게 한다. 제품 코드나 테스트를 작성시키지 않는다.
- 실행 UI/metadata/resolver가 노출한 실제 모델이 정확히 `gpt-5.3-codex-spark`인지 확인한다. TOML 값이나 에이전트 자기소개는 runtime 증거가 아니다.
- 다른 모델, fallback, 불명확한 metadata가 보이면 M0.4 FAIL/UNCERTAIN으로 남기고 제품 구현을 시작하지 않는다.

5. 최종 적대 감사와 종료

- M0 evidence register, 실제 hook evidence, Serena clean-path/TypeScript evidence, exact model runtime evidence만 넘겨 read-only final adversarial gate를 받는다.
- actionable P0/P1/P2를 먼저 보고받고 최대 두 repair round만 허용한다. 같은 P0/P1이 반복되면 중단한다.
- 모든 gate가 PASS일 때만 M0를 Complete로 바꾸고 `CHANGELOG.md`와 `.agent/progress.md`를 갱신한다.
- explicit paths만 stage하고 staged diff/check를 본 뒤 M0.4 signed commit을 만든다. `git add .`, amend, signing bypass, push는 금지다.
- M0.4 signed commit을 `git verify-commit HEAD`로 검증한 뒤 결과와 다음 M1 후보를 보고한다. M1은 사용자의 다음 승인 전에는 시작하지 않는다.

중지 조건:

- clean root/path/서명 또는 선택된 진입 모드의 expected Git 상태 불일치
- hook definition trust 또는 실제 lifecycle dispatch 미입증
- Serena가 trailing-space 프로젝트를 계속 활성화하거나 TypeScript server가 ready가 아님
- `spark_implementer` 미발견, exact model 미입증, fallback 흔적
- 예상 밖 레거시/비밀/외부 산출물
- 제품 코드, package 설치, Docker, LAN/EW11 접근이 필요해짐
- 두 repair round 뒤 같은 P0/P1 반복

각 주장에 scope/version/date, authority, locator, verification method, support/limit/conflict, ignored instruction, gap을 원장에 남겨. M0.4가 완전히 PASS하기 전에는 “M0 완료”라고 말하지 마.
```

## Operator note

After the handoff commit is signed, copy this entire file with:

```sh
pbcopy < .agent/restart-handoff.md
```

Verify clipboard byte count and SHA-256 against the file without printing the prompt. Then close this session, open a fresh Codex session at the clean root, and paste the block above (or the entire clipboard contents).
