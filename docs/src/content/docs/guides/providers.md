---
title: Provider — ACP vs SDK
description: 위젯이 로컬 Claude 와 연결되는 두 가지 방법 — ACP (기본) 와 SDK. 무엇을 언제 쓸지.
---

agent-devtools 는 위젯과 로컬 Claude 사이를 잇는 두 가지 **provider** 를
제공한다. 위젯의 설정 패널에서 언제든 전환할 수 있다.

| Provider         | 어떤 구현인가                                                                                                | 어떻게 동작하는가                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`acp`** (기본) | [@agentclientprotocol/claude-agent-acp](https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp) | dev 서버가 **호스트 node 프로세스로 ACP 어댑터 스크립트** (`@agentclientprotocol/claude-agent-acp/dist/index.js`) 를 spawn 해 stdio JSON-RPC 로 대화한다. 어댑터가 내부적으로 Claude Code 를 호출한다. |
| **`sdk`**        | [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)               | dev 서버 **프로세스 안에서** Claude Agent SDK `query()` 가 직접 호출된다. 별도 자식 프로세스 spawn 없이 in-process 로 동작한다.                                                                        |

## 한 줄 결론

- **`acp` (기본) 를 그대로 써라** — 안정적이고, Claude Code 의 정식 protocol 이며,
  위젯 시점부터 정식 지원되는 통합이다.
- **`sdk` 는 SDK 가 공식 안정 버전으로 풀렸을 때 (2026-06-15 예정) 전환을 고려.**
  지금은 실험 트랙이고, 초기 릴리스 시점에서는 비교/검증 용도다.

## 둘 다 같은 OAuth 세션을 쓴다

두 provider 모두 **본인의 `~/.claude` OAuth 세션을 재사용**한다.

- `acp` 는 `claude` CLI 가 평소 쓰는 그대로의 세션을 자식 프로세스에서 쓴다.
- `sdk` 는 같은 토큰 저장소를 SDK 가 직접 읽는다.

어느 쪽도 **Anthropic API 키를 요구하지 않는다**. 따로 결제하지 않는다.

## ACP — 무엇이고 왜 기본인가

ACP 는 [Agent Client Protocol](https://github.com/zed-industries/agent-client-protocol)
의 약자다. Claude Code, Zed, 그리고 [Zed 가 만든 ACP 어댑터](https://github.com/zed-industries/claude-code-acp)
가 사용하는 stdio JSON-RPC 기반 프로토콜이다.

### 동작 흐름

```
브라우저 위젯
   │  HTTP POST /v1/agent/stream  (SSE)
   ▼
Vite dev 서버 (agent-devtools 플러그인)
   │  spawn(process.execPath,
   │        ['.../@agentclientprotocol/claude-agent-acp/dist/index.js'])
   ▼
ACP 어댑터 자식 프로세스 (host node + stdio JSON-RPC)
   │  내부적으로 Claude Code 를 호출
   ▼
~/.claude OAuth 세션 사용 → Anthropic
```

> 실제 spawn 위치: `packages/core/src/providers/acp-runtime.ts:496` —
> `require.resolve('@agentclientprotocol/claude-agent-acp/dist/index.js')` 로
> 어댑터 스크립트 경로를 찾고 `process.execPath` (호스트 node) 의 인자로 넘긴다.

### 왜 기본인가

1. **명확한 프로세스 경계.** Claude Code 가 별도 프로세스라서 메모리 누수 /
   세션 충돌이 dev 서버에 영향을 주지 않는다. 죽으면 다시 spawn 하면 끝.
2. **공식 지원 채널.** Zed 가 만들고 Anthropic 이 사용하는 표준 통합 방식.
   업데이트가 빠르다.
3. **권한 모드 / pairing token 모두 검증됨.** 통합 테스트
   (`packages/e2e/specs/providers-live.spec.ts`) 가 ACP 를 기준선으로 돈다.

### 한계

- spawn 비용이 약간 있다 (첫 요청 ~200ms). 두 번째 요청부터는 child 가
  살아있어서 무시할 수준.
- 매우 큰 출력의 경우 stdio 버퍼링 동작을 알아둘 필요가 있다 (대부분 영향 없음).

## SDK — 무엇이고 언제 쓰나

`@anthropic-ai/claude-agent-sdk` 는 Anthropic 이 직접 제공하는 Node 용 SDK 다.
`query()` 호출만으로 Claude Code 의 도구 (Read/Edit/Bash 등) 까지 포함된
스트리밍 응답을 받는다.

### 동작 흐름

```
브라우저 위젯
   │  HTTP POST /v1/agent/stream  (SSE)
   ▼
Vite dev 서버 (agent-devtools 플러그인)
   │  query({ prompt, options })  // in-process
   ▼
@anthropic-ai/claude-agent-sdk
   │  ~/.claude OAuth 세션 사용 → Anthropic
```

> 실제 호출 위치: `packages/core/src/providers/sdk.ts:47` —
> SDK 의 `query()` 가 dev 서버 프로세스 안에서 직접 실행된다.

### 장점

- **자식 프로세스 없음.** spawn 비용도 없고, 별도 ACP 어댑터 의존성도 없다.
- **SDK 가 직접 노출하는 옵션을 그대로 쓸 수 있다.** custom tool, MCP server
  연동 등 SDK 의 표면적이 그대로 쓰인다.

### 왜 아직 기본이 아닌가

- SDK 의 공식 안정 버전이 **2026-06-15** 부터 풀린다. 그 전까지는 minor 마다
  타입 / 동작이 바뀔 수 있다.
- 통합 테스트 (`packages/e2e/specs/providers-live.spec.ts`) 의 기준선은 ACP 다.
  SDK 는 코드와 테스트는 유지하지만, 사용자에게 기본으로 권하지 않는다.

## Provider 바꾸기

Provider 는 **위젯 설정 패널에서 런타임에 전환**한다. `vite.config.ts` 의
플러그인 옵션으로는 노출하지 않는다 — 빌드 시점 결정 사항이 아니라 세션
단위 선택이기 때문이다.

위젯 설정 (톱니바퀴) → **Provider** → `ACP` 또는 `SDK` 선택. localStorage 에
저장되며, 다음 요청부터 적용된다.

## FAQ

**Q. 두 provider 가 동시에 살아있나?**
A. 아니. 요청 단위로 라우팅된다. 위젯에서 SDK 로 바꾸면 다음 프롬프트부터 SDK
경로로 간다. 이미 떠 있는 ACP 자식 프로세스는 idle 상태로 남아 있다가 일정 시간
후 정리된다.

**Q. `claude` CLI 가 없는데 SDK 만 쓸 수 있나?**
A. 가능. SDK 는 `~/.claude` OAuth 세션만 있으면 동작한다 (CLI 로 `/login` 만 한
번 해두면 된다). 다만 그러면 ACP 로 fallback 이 안 되니, 위젯 설정 패널에서
provider 를 `SDK` 로 바꿔두는 게 좋다.

**Q. 어떤 게 더 빠른가?**
A. 정상 응답 streaming 속도는 거의 같다. 첫 요청만 ACP 가 spawn 비용
(~200ms) 만큼 느리다.

**Q. Vue / Next / Nuxt 에서도 두 provider 다 되나?**
A. provider 추상화는 코어에 있어서, 어댑터가 추가되면 두 provider 다 자동으로
지원된다 (Vue / Next / Nuxt 어댑터는 후속 릴리스에서 합류).
