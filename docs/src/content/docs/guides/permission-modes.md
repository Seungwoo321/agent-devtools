---
title: 권한 모드
description: agent-devtools 의 5가지 권한 모드 — `default`, `acceptEdits`, `plan`, `bypassPermissions`, `dontAsk` — 와 액션 카테고리별 안전 정책.
---

권한 모드는 위젯 설정 패널에서 전환할 수 있다. 위젯이 별도 저장값 없이
마운트될 때의 **초기 모드는 `acceptEdits`** 다 (`packages/react/src/settings/types.ts:39`
의 `DEFAULT_SETTINGS.permissionMode`). `bypassPermissions` 는 설정 패널 안에서만
노출되고 채팅 컴포저에서는 선택할 수 없다.

> 다섯 모드의 이름 (`default`, `acceptEdits`, `plan`, `bypassPermissions`,
> `dontAsk`) 은 모두 Claude Agent SDK 의 `permissionMode` enum 에서 그대로
> 가져온 것이다. 그래서 모드 이름 중 하나가 공교롭게도 `default` 라는 영단어와
> 충돌하지만, 이 문서에서는 모드를 가리킬 때 항상 코드 스타일 (`default`) 로
> 표기해 "초기 모드" 라는 일반 의미와 구분한다.

## 5가지 모드

브라우저 위젯 사용자는 터미널 앞에 없기 때문에 ACP `session/request_permission`
프롬프트를 인터랙티브하게 띄울 수 없다. 그래서 각 요청은 두 단계로 판정된다.

1. **모드 단계** — `bypassPermissions` 는 무조건 허용, `plan` / `default` 는
   무조건 cancelled. 나머지 모드(`acceptEdits`, `dontAsk`)는 정책 단계로 내려간다.
2. **정책 단계** — 도구 호출의 ACP `ToolKind` 를 네 카테고리
   (`fileEdit`, `bash`, `webFetch`, `mcpTool`) 로 분류하고 `PermissionPolicy` 의
   해당 항목 (`'auto' | 'ask' | 'deny'`) 으로 결정한다.

### `default`

모든 권한 요청을 거절한다 (`outcome: cancelled`). 위젯 트랜스포트에는
사용자에게 동의를 받을 UI 수단이 없기 때문에, 이 모드에서는 사실상 동의가 필요한
도구는 모두 막힌다.

### `acceptEdits` (마운트 시 초기 모드)

워크스페이스 안의 파일 편집은 자동 승인하고, Bash / web fetch / MCP 도구는
정책에 따라 결정한다. 디폴트 정책에서는 fileEdit 만 자동 허용이고 나머지는
ask 로 떨어져 cancelled — 무인 상태에서 외부 효과가 새어나가지 않게 막는다.

### `plan`

읽기 전용 계획(plan) 모드. 권한 요청은 카테고리와 무관하게 모두 거절된다.
코드 변경 전에 모델이 계획을 수립하게 할 때 쓴다.

### `bypassPermissions`

모든 권한 요청을 카테고리/정책과 무관하게 즉시 허용한다. 한 세션의 모든
안전 프롬프트를 사실상 꺼버리는 효과가 있어, 채팅 컴포저에서는 선택할 수 없고
오직 설정 패널에서만 명시적으로 전환할 수 있다.

### `dontAsk`

`acceptEdits` 와 동일한 정책 경로를 탄다. SDK 시맨틱으로는 "프롬프트를 띄우지
않고, 사전 승인된 것이 아니면 거절" 이지만 위젯에는 프롬프트 surface 가 없으므로
실질적으로 `acceptEdits` 와 같은 결정 흐름이 된다. 어떠한 권한 프롬프트도
표면화하지 않을 의도를 명시하고 싶을 때 사용한다.

## 액션 카테고리 정책 매트릭스

ACP `ToolKind` → 카테고리 매핑:

| ACP `ToolKind` | 카테고리    | 분류 사유                                       |
| -------------- | ----------- | ----------------------------------------------- |
| `edit`         | `fileEdit`  | 워크스페이스 파일 수정                          |
| `delete`       | `fileEdit`  | 워크스페이스 파일 삭제                          |
| `move`         | `fileEdit`  | 워크스페이스 파일 이동                          |
| `execute`      | `bash`      | 쉘 명령 실행 — 외부 부수효과                    |
| `fetch`        | `webFetch`  | 외부 네트워크 요청                              |
| `other`        | `mcpTool`   | 분류되지 않은 MCP 도구 — 어떤 부수효과인지 모름 |
| `read`         | (safe-read) | 읽기 전용, 항상 자동 허용                       |
| `search`       | (safe-read) | 검색, 항상 자동 허용                            |
| `think`        | (safe-read) | 내부 사고, 항상 자동 허용                       |
| `switch_mode`  | (safe-read) | 모드 전환, 항상 자동 허용                       |

기본 정책 (`DEFAULT_PERMISSION_POLICY`):

| 카테고리   | 디폴트 | 의미                                                 |
| ---------- | ------ | ---------------------------------------------------- |
| `fileEdit` | `auto` | 자동 허용 — devtools 의 핵심 활용 경로               |
| `bash`     | `ask`  | cancelled — 사용자가 명시적으로 모드를 올려야 실행됨 |
| `webFetch` | `ask`  | cancelled — 외부 네트워크 호출은 디폴트로 막는다     |
| `mcpTool`  | `ask`  | cancelled — 어떤 MCP 도구인지 모르므로 보수적        |

각 카테고리 값:

- `'auto'` — `allow_once` 옵션을 우선 골라 자동 승인.
- `'ask'` — `outcome: cancelled`. 위젯에 물어볼 UI 가 없으므로 사실상 거절.
- `'deny'` — `reject_once` 옵션을 골라 명시적 거절. reject 옵션이 없으면
  `outcome: cancelled` 로 fallback.

모드 × 카테고리 결정 매트릭스 (디폴트 정책 기준):

| 모드 \ 카테고리     | `fileEdit` | `bash`    | `webFetch` | `mcpTool` | safe-read |
| ------------------- | ---------- | --------- | ---------- | --------- | --------- |
| `default`           | cancelled  | cancelled | cancelled  | cancelled | cancelled |
| `plan`              | cancelled  | cancelled | cancelled  | cancelled | cancelled |
| `acceptEdits`       | allow      | cancelled | cancelled  | cancelled | allow     |
| `dontAsk`           | allow      | cancelled | cancelled  | cancelled | allow     |
| `bypassPermissions` | allow      | allow     | allow      | allow     | allow     |

## 커스텀 정책

`createAcpProvider({ permissionPolicy })` 또는 `runtime.run({ permissionPolicy })` 로
디폴트 정책을 항목별로 덮어쓸 수 있다. 자기-호스팅 환경에서 Bash 자동 실행을
켜거나, MCP 도구를 항상 막고 싶을 때 사용한다.

```ts
import { createAcpProvider } from '@agent-devtools/core';

const provider = createAcpProvider({
  permissionPolicy: {
    bash: 'auto', // CI 안에서 셸 자동 허용
    webFetch: 'deny', // 외부 네트워크는 명시 거절
  },
});
```

생략된 필드는 `DEFAULT_PERMISSION_POLICY` 값으로 합쳐진다.

구현 근거: `packages/core/src/providers/acp-runtime.ts` 의 `decidePermission`
함수와 `packages/core/src/providers/acp.ts` 의 `PermissionPolicy` 타입,
`DEFAULT_PERMISSION_POLICY` 상수.
