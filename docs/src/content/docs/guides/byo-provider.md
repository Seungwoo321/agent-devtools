---
title: 자기 provider 가져오기
description: Claude Code 를 OpenAI / Groq / Cerebras / OpenRouter — 또는 custom LLM — 으로 갈아 끼우는 법. widget 은 안 건드린다.
---

agent-devtools 는 **두 개의 provider 레인** 을 가진다. 디폴트는 위젯이
**ACP 를 통해 로컬 Claude Code 와 대화** 하는 경로 — 이미 인증된 `claude` CLI
를 그대로 쓴다. **SDK 레인** 은 그 자리를 `@agent-devtools/harness-core` 의
`LLMProvider` 계약을 만족하는 모든 백엔드로 교체한다.

위젯은 어느 백엔드인지 알지 못한다. provider 추상은 **서버측 seam** 이지
브라우저측 feature flag 가 아니다.

## 두 레인, 하나의 계약

| 레인          | 식별자            | 모양             | 현재 구현                          |
| ------------- | ----------------- | ---------------- | ---------------------------------- |
| ACP (default) | 해당 없음         | 로컬 CLI spawn   | `claude` CLI (Claude Code)         |
| SDK           | `LLMProvider`     | request/response | OpenRouter, Groq, Cerebras, OpenAI |
| Session SDK   | `SessionProvider` | 영속 세션        | Claude Agent SDK                   |

ACP 레인은 기존 `~/.claude/` OAuth 세션을 재사용한다 — API 키도 추가 계정도
필요없다. SDK 레인은 환경변수에서 API 키를 읽는다.

## `LLMProvider` 인터페이스

출처: `packages/harness-core/src/llm/types.ts`.

```ts
export interface LLMProvider {
  readonly supportsTools: boolean;
  readonly providerName: string;

  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  chatWithVision(
    messages: ChatMessage[],
    imageContent: ImageContent,
    options?: ChatOptions,
  ): Promise<ChatResponse>;
  chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ToolChatResponse>;
}
```

3 메서드, 3 phase — 텍스트 전용 생성, vision turn, tool-use 루프. 전략은
`supportsTools === false` 인 provider 에 대해 `chatWithTools` 를 호출하지
않으므로, function calling 이 없는 LLM 도 텍스트 turn 만으로 루프를 망가뜨리지
않고 동작한다.

## 번들된 SDK provider

| Provider name | 모듈                                 | Env var              |
| ------------- | ------------------------------------ | -------------------- |
| `openrouter`  | `harness-core/src/llm/openrouter.ts` | `OPENROUTER_API_KEY` |
| `groq`        | `harness-core/src/llm/groq.ts`       | `GROQ_API_KEY`       |
| `cerebras`    | `harness-core/src/llm/cerebras.ts`   | `CEREBRAS_API_KEY`   |
| `openai`      | `harness-core/src/llm/openai.ts`     | `OPENAI_API_KEY`     |

그리고 세션 모양 provider:

| Session provider   | 모듈                                       | Env var             |
| ------------------ | ------------------------------------------ | ------------------- |
| `claude-agent-sdk` | `harness-core/src/llm/claude-agent-sdk.ts` | `ANTHROPIC_API_KEY` |

세션 provider 는 `SessionProvider` 를 반환한다 — 하니스가 request/response
루프 대신 SDK session 루프로 라우팅한다. ACP 와 session SDK 만 서버측에서 turn
간 대화 상태를 보존한다.

## Provider 고르기 — no-fallback 규칙

```ts
import {
  createProvider,
  createSessionProvider,
} from '@agent-devtools/harness-core/llm';

// Request/response 레인
const openai = createProvider('openai', 'gpt-4o-mini');

// Session 레인 (Claude Code 구독 인증 또는 ANTHROPIC_API_KEY)
const claude = createSessionProvider('claude-agent-sdk', 'claude-sonnet-4-6');
```

`createProvider` 와 `createSessionProvider` 는 **model 이름이 명시적으로
주어져야 한다**. "디폴트 모델" 은 존재하지 않는다 — 하니스는 호스트 대신
모델을 고르지 않는다. 이유는 운영성에 있다: 공유 라이브러리 안의 디폴트 모델은
어느 날 모델 이름이 바뀌거나 deprecate 되면 잘못된 방식으로 비용을 발생시키는
silent dependency 가 된다.

`DEFAULT_LLM_PROVIDER` 는 **호스트가 직접 읽는** opt-in 환경변수다. 하니스가
자동으로 참조하지 않는다.

## 탐색 — 지금 무엇이 연결돼 있는지

```ts
import {
  getAvailableProviders,
  getAvailableSessionProviders,
  getProviderModels,
} from '@agent-devtools/harness-core/llm';

getAvailableProviders(); // -> env 키 기준 ['openai', 'groq', ...]
getAvailableSessionProviders(); // -> ANTHROPIC_API_KEY 가 있으면 ['claude-agent-sdk']
getProviderModels('openai'); // -> 번들된 모델 whitelist
```

이 셋이 widget 에 "지금 어떤 모델과 대화 중인지" 인디케이터를 띄우기 위해
호스트가 마운트하는 `/info` HTTP 엔드포인트의 building block 이다.

## Custom provider 추가하기

`LLMProvider` 인터페이스를 구현하고, factory 를 통해 등록(fork-and-edit)하거나
자기 호스트의 harness-core run loop 에 인스턴스를 직접 넘긴다.

```ts
import { BaseLLMProvider } from '@agent-devtools/harness-core/llm';
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from '@agent-devtools/harness-core/llm';

class LocalOllamaProvider extends BaseLLMProvider {
  readonly providerName = 'ollama';
  readonly supportsTools = false;

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const res = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        model: options?.model ?? 'llama3.2',
        messages,
        stream: false,
      }),
    });
    const json = await res.json();
    return { content: json.message.content, finishReason: 'stop' };
  }

  // supportsTools = false 면 전략이 chatWithVision / chatWithTools 를
  // 호출하지 않으므로 생략 가능.
}
```

`packages/harness-core/src/llm/factory.ts` 는 얇은 switch — `case 'ollama':`
한 줄 추가하면 registry 식 탐색이 그대로 동작한다. 아니면 factory 를 우회해서
provider 인스턴스를 하니스에 직접 넘긴다. run loop 은 이름이 아니라
`LLMProvider` 를 받는다.

## Transport — 오늘은 pluggable 아니다

위젯과 로컬 dev 서버 사이의 페어링 토큰 + 루프백 HTTP + SSE transport 는
고정되어 있다. 세 번째 레인이 없다. seam 은 서버측 _provider_ 지 브라우저측의
wire format 이 아니다.

원격 dev 컨테이너가 로컬 브라우저와 대화하는 등 다른 wire transport 가
필요하면 이슈를 등록한다. 오늘은 의도적인 non-feature 다.

## 왜 이게 중요한가

위젯은 API 키를 들고 다니지 않는다. 호스트가 정책(비용/지연/능력) 기반으로
어떤 레인을 쓸지 결정하고, 위젯은 서버가 돌려주는 것을 그대로 읽는다. Claude
Code 에서 OpenAI 로 단일 사용자 세션을 갈아 끼우는 일은 서버측 토글이지
재배포도 위젯 재빌드도 아니다.
