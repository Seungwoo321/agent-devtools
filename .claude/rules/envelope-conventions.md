# Rule: Clawket Envelope Conventions

agent-devtools 의 Clawket task 는 daemon 의 envelope 검증을 통과해야 등록된다. 다음은 이 레포에서 task 생성 시 반복적으로 부딪힌 함정과 회피 규칙.

## 필수 envelope 필드

`clawket task create` 호출에서 다음 필드는 daemon 이 강제한다 (`ENVELOPE_REQUIRED_FIELDS_MISSING`):

- `--intent` — 이 task 가 무엇을 달성하는지 한 문장.
- `--prompt-template` — 실행 에이전트가 그대로 받을 프롬프트 본문.
- `--success-criteria` — 1 회 이상, 반복 지정 가능. 측정 가능한 완료 조건.
- `--scenario-id` — 이 레포에서는 `US-AGDT-<DOMAIN>-NNN` 패턴 (`ADP` 어댑터 작업, `DOC` 문서/규칙, `SEC` 보안, `OBS` 관찰성). X3 risk 회피.

## Daemon entropy 오탐 — 영문 자연어로 작성

clawketd 는 envelope 필드를 secret leak 휴리스틱으로 검사하고, 일정 entropy 이상이면 `looks like a secret` 으로 reject 한다. 이 레포에서 관찰된 임계는 대략 **bits/char ≥ 4.95**.

**한·영 혼용 + 코드 심볼 + punctuation 조합이 오탐의 주범**. 짧은 한국어 문장은 거의 다 임계 초과로 reject 된다.

회피 규칙:

1. `--intent`, `--prompt-template`, `--success-criteria` 는 **영문 자연어** 로 작성한다. 한 문단 통째로 문장 형태. 코드 토큰은 자연어로 풀어쓰거나 흔한 영단어 사이에 끼워 entropy 를 떨어뜨린다.
2. `@agent-devtools/<x>` 같은 스코프 토큰을 한 필드 안에 3 회 이상 반복하지 않는다. "the vue adapter" 같은 풀어쓰기 표현으로 대체.
3. 한국어로 적고 싶은 상세 (배경, 파일 경로 매핑, 리뷰 노트 등) 는 **`--body`** 로 옮긴다. `body` 는 entropy 검사 대상이 아니므로 한국어로 마음껏 쓸 수 있다.
4. task **제목** (`<TITLE>` 위치 인자) 은 한국어 허용. envelope 가 아니라서 검사 대상이 아니다.

## Zombie row 처리

daemon 은 envelope 검사 실패 시에도 일부 경로에서 task row 가 insert 된 채 남는 버그가 관찰됨 (`looks like a secret` 후 좀비). 좀비가 의심되면:

```bash
clawket task list --unit <UNIT_ID> --format json | jq '.[] | select(.active_envelope == null) | .id'
```

로 envelope null 인 row 찾아 `clawket task delete <ID>` 로 청소. 좀비가 남으면 idx 가 어긋나서 후속 task 의 `--idx N` 가 unique 충돌을 일으킨다 (`ERROR: insert task`).

`--idx` 는 절대 필수가 아니다. daemon 이 자동 부여하므로 entropy 디버깅 중에는 생략하고, 다 끝난 뒤에 `clawket task update --idx` 로 정렬을 잡는 게 안전하다.

## 의존성 그래프

`--depends-on` 은 **같은 Plan 안의 다른 task ID 만** 받는다. 다른 Plan 의 task 는 못 가리킨다. cross-plan 동기화가 필요하면 메타 task 로 묶거나 Cycle 종료 시점에 수동 처리.

콤마 구분 다중 의존 (`--depends-on T1,T2,T3`) 은 지원된다. 사용 권장.

## 실행 모드 (Unit-level)

Unit 의 `--mode parallel` 은 sub-agent dispatch 시 그 Unit 안의 task 들을 동시 실행 가능 신호로 쓰인다. 의미 있는 병렬화 (서로 독립 파일 그룹) 일 때만 사용. 순차적 의존이 사슬로 있는 Unit 은 `sequential` (기본) 그대로.

## 작성 예시

```bash
clawket task create --unit $U --cycle $C --quiet --type feature --priority high \
  --scenario-id "US-AGDT-ADP-104" --depends-on "$T11" \
  --intent "Build the floating chat widget UI as Vue components inside a closed shadow root so the host app stays isolated from devtools styles and React." \
  --prompt-template "Inside packages/vue/src create a mount entry point that attaches a closed shadow root to the host document, renders the widget as Vue 3 components inside it, and wires messages to the core package." \
  --success-criteria "Mounting the widget on the example page does not leak any global styles into the host" \
  --success-criteria "Widget messages are exchanged with core through the same protocol used by the React adapter" \
  --success-criteria "Closing the widget removes the shadow root and disposes all watchers" \
  "@agent-devtools/vue: widget UI Vue port (closed shadow DOM)"
```

- envelope 3 필드는 영문 자연어, task 제목은 한국어 — 검사 통과.
- success-criteria 는 3 회 반복 — 측정 가능한 시나리오 3 개.
- scenario-id 는 `ADP` 도메인의 어댑터 104 번 — 작업 추적용.
