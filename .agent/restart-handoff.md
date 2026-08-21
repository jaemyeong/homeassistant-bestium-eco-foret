# M0 Restart Handoff

Prepared: 2026-08-21 (Asia/Seoul)

This is the authoritative prompt for the fresh Codex session after the user-selected M0.3b Spark `xhigh` configuration checkpoint. Start that session from:

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
- 미래 제품 코드는 프로젝트 로컬 `spark_implementer`에게만 맡기며 정확한 모델은 `gpt-5.3-codex-spark`, reasoning effort는 `xhigh`다. silent fallback은 금지다.
- M0.4에서도 제품 코드는 작성하지 않는다. 정확한 모델의 read-only canary만 수행한다.
- Web + Context7로 현재 주장을 반복 실증한다. Sosumi는 Apple 주장에만 사용하고 이번 M0.4에는 `N/A: Apple 주장 없음`으로 기록한다.
- 테스트 우선, read-only 적대 감사, CHANGELOG/진행 원장 갱신, explicit staging, signed commit 규칙을 유지한다.

이미 완료되고 서명 검증된 커밋:

- `a47a85bf86a685e583042527fd908fc7e4b82d7f` — `chore(m0): isolate legacy research workspace`
- `e3fb4acb108e8c353f5b26c056049cc483364da2` — `chore(m0): add session continuity guard`
- `1b87afee93a8c2c8081e50aed78db090be5d96c9` — `chore(m0): configure TypeScript implementation agent`
- `09eff523f50d0b3e2bafc2ca0e3cd334cab25598` — `docs(m0): prepare restart handoff`
- `3501506bba5e33e86a68c4f88b62adde5c9e25ed` — `chore(m0): stabilize Serena project config`

Spark effort를 `xhigh`로 올리고 이 수정 핸드오프를 추가한 현재 HEAD는 서명된 `chore(m0): raise Spark reasoning` 커밋이어야 한다. 이 문서는 자기 자신의 SHA를 기록할 수 없으므로 `git log -1 --show-signature`로 실제 SHA와 Good signature를 확인해 원장에 기록해.

보존된 레거시 HEAD:

- `HomeNetwork`: `a1d6ba5167586ad1136a2145e54e4e1d1d4533f8`
- `homeassistant-addons`: `903cc87c1c1709f076a50eab9c2c316325b9c988`

현재 구성:

- `.codex/hooks.json`: `startup|resume|clear|compact`만 허용하는 `SessionStart` 훅
- `.codex/hooks/session_start.py`: 고정 bootstrap context만 출력하며 입력, transcript, 환경 변수를 반사하지 않음
- `.codex/hooks/test_session_start.py`: 5개 unittest, 네 source와 malformed/non-string/secret 비반사를 포함
- `.codex/agents/spark_implementer.toml`: exact Spark + xhigh, fallback 없음
- `.serena/project.yml`: Serena 1.7.0이 clean-root 첫 activation에서 보강한 canonical 22-key 설정. 의도된 유효값은 clean project name + `typescript`뿐이며 activation command, initial prompt, external workspace, tool override는 없음
- `graphify-out/`: 전역 Git 훅이 만든 ignored M0 control-plane graph. 제품 그래프가 아니며 제품 설계 근거로 쓰지 않음
- `.codegraph/`: 사용자가 추가한 3-file Python/YAML M0 control-plane index. 제품 TypeScript가 아니며 제품 설계 근거로 쓰지 않음

M0.4에서 clean-path/signature, Serena canonical no-rewrite + active TypeScript `ready`, trusted hook definition, 실제 `clear`/`compact` dispatch, 5개 synthetic hook test, hook final audit는 PASS했다. 당시 exact Spark + medium runtime canary와 agent audit도 PASS했지만, 사용자가 이후 effort를 `xhigh`로 올렸으므로 medium 결과는 acceptance에서 superseded다. hook/Serena 증거를 재구성하지 말고 원장의 실제 완료 증거를 읽어라. 새 프로세스의 xhigh discovery/runtime metadata와 그 최종 agent audit만 아직 미입증이다. 설정 파일이나 에이전트 자기보고만으로 PASS 처리하지 마.

Serena 1.7.0 canonical 설정은 fresh process와 post-clear/post-compact activation에서 더 이상 파일을 변경하지 않았다. 새 process bootstrap에서 동일 상태를 재확인하되 완료된 lifecycle canary를 다시 수행하지 마.

M0.4를 다음 순서로 수행해.

0. M0.4 xhigh 재진입 확인

- 다른 gate보다 먼저 현재 HEAD subject/signature, `git status --short`, `.agent/progress.md`의 `M0.4 clear checkpoint` 절을 함께 확인한다.
- HEAD가 서명된 `chore(m0): raise Spark reasoning`이고 worktree가 clean이며 checkpoint 마지막 줄이 정확히 `Next event: fresh-process xhigh canary`여야 한다.
- 다른 HEAD, dirty path, 누락되거나 다른 sentinel은 예상 밖 상태이므로 중단한다.
- steps 1–3의 경계·부트스트랩·tracked hook/test 무결성 확인을 먼저 실행한 뒤 step 4의 xhigh canary를 수행한다. 완료된 hook lifecycle/Serena/medium canary를 재구성하거나 새 성공으로 기록하지 않는다.

1. 경로와 Git 경계 확인

- `pwd -P`와 `git rev-parse --show-toplevel`이 정확히 `/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret`인지 확인한다.
- `/Users/jaemyeong/Projects/homeassistant-bestium-eco-foret `가 없고 research sibling이 존재하는지 확인한다.
- worktree가 clean인지 확인한다.
- 위 네 커밋, Serena repair 커밋, 현재 xhigh checkpoint 커밋을 `git verify-commit`으로 검증한다.
- dirty 상태, path collision, 서명 실패가 있으면 즉시 중단한다.

2. 작업 부트스트랩

- `graphify-out/graph.json`이 있으므로 raw search 전에 현재 M0 상태를 `graphify query`로 질의한다. Graphify 0.9.47과 설치된 0.9.43 skill의 버전 경고는 기록하되 package 설치나 skill update는 M0에서 하지 않는다.
- `.codegraph/`가 있으므로 raw source read 전에 현재 M0 control-plane 상태를 `codegraph explore`로 확인한다. 이 3-file Python/YAML index에는 제품 TypeScript가 없으므로 제품 설계 근거로 쓰거나 새 제품 index를 만들지 않는다.
- Serena initial instructions를 읽고 clean path를 활성화한다. `get_current_config`에서 프로젝트명이 `homeassistant-bestium-eco-foret`인지, 실제 경로가 clean root인지, TypeScript language server가 활성·ready인지 확인한다. generic `ready`만으로 통과시키지 말고 활성 서버가 TypeScript임을 확인한다. 현재 세션에서 남아 있던 trailing-space 등록 상태를 재사용하지 않는다.
- Serena onboarding은 M0.4 canary에 필수인 경우에만 수행하고, 불필요한 memory/scaffold를 만들지 않는다.
- OpenAI 공식 Hooks/Subagents 문서와 Context7 `/openai/codex`, Serena 공식 소스와 Context7 `/oraios/serena`를 다시 확인하고 claim 단위 증거를 원장에 기록한다.
- Sosumi는 `N/A: M0.4에 Apple API/HIG/Swift 주장이 없음`으로 기록한다.

3. 완료된 SessionStart gate 보존

- 원장의 C08, C17, C19, C23과 E28, E31에서 trust, 실제 `clear`/`compact`, synthetic test, final hook audit 근거를 읽는다.
- tracked hook definition/source/test에 xhigh checkpoint 이후 diff가 없는지 확인하고 `python3 .codex/hooks/test_session_start.py`를 다시 실행한다.
- definition이 그대로면 `/clear`나 `/compact`를 다시 요청하지 않는다. 달라졌거나 기존 증거와 충돌하면 중단한다.

4. exact Spark discovery/runtime canary

- `codex debug models`의 live catalog에서 exact slug `gpt-5.3-codex-spark`와 `xhigh` 지원을 다시 확인한다.
- 새 프로세스가 프로젝트 로컬 `spark_implementer`를 발견하는지 확인한다. 발견되지 않으면 fallback agent를 쓰지 말고 중단한다.
- `spark_implementer`에게 read-only canary 하나만 맡긴다: 현재 clean Git root와 HEAD를 읽고 변경 없이 보고하게 한다. 제품 코드나 테스트를 작성시키지 않는다.
- 실행 UI/metadata/resolver가 노출한 실제 모델이 정확히 `gpt-5.3-codex-spark`, effort가 정확히 `xhigh`인지 확인한다. TOML 값이나 에이전트 자기소개는 runtime 증거가 아니다.
- 다른 모델, fallback, 불명확한 metadata가 보이면 M0.4 FAIL/UNCERTAIN으로 남기고 제품 구현을 시작하지 않는다.

5. 최종 적대 감사와 종료

- 완료된 hook audit는 definition이 그대로면 보존한다. M0 evidence register, 실제 hook evidence, Serena clean-path/TypeScript evidence, exact model+xhigh runtime evidence만 넘겨 custom-agent read-only re-audit와 최종 통합 adversarial gate를 받는다.
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
