[English](./README.md) · [한국어]

# @agent-devtools/harness-core

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 와 외부 SaaS consumer 가 공유하는 도메인-무관 에이전트 하니스. loop 전략과 LLM provider 추상화를 제공하고, 하위 제품이 자신의 도메인을 끼워 넣습니다.

[![npm](https://img.shields.io/npm/v/@agent-devtools/harness-core.svg)](https://www.npmjs.com/package/@agent-devtools/harness-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

## 기능

- **Loop 전략** — `orchestratorLoop`, `modelDrivenLoop`, `sdkSessionLoop`, 그리고 옵션으로 `langgraphLoop` runner. 도메인 코드를 재작성하지 않고 실행 형태를 교체할 수 있습니다.
- **LLM provider 추상화** — OpenRouter, Groq, Cerebras, 공식 OpenAI API, OpenAI-호환 엔드포인트용 일급 provider. 옵션으로 Claude Agent SDK provider.
- **Tier 해상도** — 무거운 호출과 가벼운 호출을 provider 단위로 분리하는 도메인 레벨 tiering 훅.
- **도메인 확장 포인트** — `GenerationDomain`, `OperationDomain`, `DomainBinding`, `PromptProvider`, `ToolProvider`. DSL, 비즈니스 룰, 테넌트 정책은 의도적으로 비어 있고, consumer 가 주입합니다.
- **세션 모델** — provider 중립적인 `SessionProvider`. 스트리밍 이벤트는 `type` 으로 `assistant_text`, `tool_use`, `tool_result`, `usage`, `done` 을 실어 하니스 기반 UI 를 구축할 수 있습니다.

이 패키지는 in-page `@agent-devtools` 위젯 런타임과, dev-only 위젯 layer 없이 동일한 하니스만 쓰고 싶은 외부 SaaS consumer 가 공유합니다.

## 설치

```bash
pnpm add @agent-devtools/harness-core
```

선택적 peer 의존성 (실제 사용하는 것만 설치):

- `@anthropic-ai/claude-agent-sdk >= 0.2.140` — `ClaudeAgentSDKProvider` 사용 시 필요.
- `@langchain/langgraph >= 1.3.0` — `langgraph` loop 전략 사용 시 필요.

## 사용법

### Provider 직접 사용

```ts
import { OpenRouterProvider } from '@agent-devtools/harness-core';

const provider = new OpenRouterProvider({
  apiKey: process.env.OPENROUTER_API_KEY!,
  model: 'meta-llama/llama-3.1-8b-instruct:free',
});

const reply = await provider.chat({
  messages: [{ role: 'user', content: 'Summarise the changelog' }],
});
```

### 환경 변수 기반 자동 선택

```ts
import {
  createProvider,
  getDefaultProvider,
} from '@agent-devtools/harness-core';

const name = getDefaultProvider(); // 'openrouter' | 'groq' | 'cerebras' | 'openai' | undefined
const provider = createProvider(name!, 'meta-llama/llama-3.1-8b-instruct:free');
```

`getDefaultProvider` 는 `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `OPENAI_API_KEY` 를 검사해 키가 존재하는 첫 provider 를 반환합니다 (없으면 `undefined`). 이어서 `createProvider(name, model)` 가 주어진 모델 ID 로 해당 provider 를 구성합니다. 앱 코드에서는 의존성을 명시적으로 드러내기 위해 직접 인스턴스화를 권장합니다.

### Loop 에 도메인 주입

```ts
import { orchestratorLoop } from '@agent-devtools/harness-core';

for await (const event of orchestratorLoop(
  input,
  llm,
  adapter,
  prompts,
  config,
)) {
  // event.type === 'start' | 'progress' | 'complete' | 'error'
}
```

- `input` — `AgentInput`: 사용자 입력과 선택적 `AgentOptions` (`AbortSignal` 포함).
- `llm` — `LLMProvider`. `sdkSessionLoop` 은 이 자리에 `SessionProvider` 를 받습니다.
- `adapter` — parser, validator, 생성 계약을 공급하는 `GenerationDomain`.
- `prompts` — 시스템 프롬프트와 tool description 을 렌더링하는 `PromptProvider`.
- `config` — `LoopConfig` (`maxIterations`, `qualityThreshold`, `tierResolver`, 텔레메트리 훅 등).

`orchestratorLoop`, `modelDrivenLoop`, `sdkSessionLoop`, `langgraphLoop` 은 동일한 5-인자 형태를 가지므로 주변 코드를 그대로 두고 전략만 교체할 수 있습니다. 각각 `event.type` 으로 구분되는 `StreamEvent` 값을 yield 합니다.

## Provider 매트릭스

| Provider           | 클래스                   | 필요 env / config                |
| ------------------ | ------------------------ | -------------------------------- |
| OpenRouter         | `OpenRouterProvider`     | `OPENROUTER_API_KEY`             |
| Groq               | `GroqProvider`           | `GROQ_API_KEY`                   |
| Cerebras           | `CerebrasProvider`       | `CEREBRAS_API_KEY`               |
| OpenAI (및 프록시) | `OpenAIProvider`         | `OPENAI_API_KEY`                 |
| Claude Agent SDK   | `ClaudeAgentSDKProvider` | `@anthropic-ai/claude-agent-sdk` |

각 provider 는 지원하는 모델 ID 목록을 함께 export 합니다 (`FREE_MODELS`, `GROQ_MODELS`, `CEREBRAS_MODELS`, `OPENAI_MODELS`).

## 요구 사항

- Node.js `>= 22.13.0`

## 관련 링크

- 모노레포: <https://github.com/Seungwoo321/agent-devtools>
- Core 패키지: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- 사용자 가이드: <https://agent-devtools-docs.vercel.app/>
- 이슈 트래커: <https://github.com/Seungwoo321/agent-devtools/issues>

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
