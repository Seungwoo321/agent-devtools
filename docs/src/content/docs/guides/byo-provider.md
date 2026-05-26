---
title: 자기 provider 가져오기
description: Claude Code 를 OpenAI / Anthropic / Ollama — 또는 다른 LLM — 으로 갈아 끼우는 법. @agent-devtools/harness-core 의 LLMProvider 인터페이스를 구현하면 끝.
---

agent-devtools 는 **두 개의 provider 레인** 을 가진다. 디폴트는 위젯이
**ACP 를 통해 로컬 Claude Code 와 대화** 하는 경로 — 이미 인증된 `claude` CLI
를 그대로 쓴다. **SDK 레인** 은 그 자리를 `@agent-devtools/harness-core` 가
export 하는 `LLMProvider` 계약을 만족하는 모든 백엔드로 교체한다.

위젯은 어느 백엔드인지 알지 못한다. provider 추상은 **서버측 seam** 이지
브라우저측 feature flag 가 아니다. 이 문서는 그 seam 을 외부 확장점으로
설명하고, 자신의 호스트에 그대로 복사해 쓸 수 있는 세 개의 어댑터 스니펫을
함께 제공한다.

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

멤버별 한 줄 설명:

- `supportsTools` — `false` 면 전략이 `chatWithTools` 를 건너뛰고 텍스트 turn 만 호출한다.
- `providerName` — 텔레메트리용 식별자. 하니스가 `AgentOutput.metadata.provider` 에 박는다.
- `chat` — 단일 텍스트 turn. `{ content, model, usage? }` 반환.
- `chatWithVision` — `chat` 과 동일하지만 `ImageContent` (base64 또는 URL) 하나를 받아 마지막 user 메시지에 끼워 넣는다.
- `chatWithTools` — tool-use turn. `{ content, toolCalls, finished, model, usage? }` 반환. model-driven 루프는 `finished === false` 인 동안 계속 호출한다.

`ChatOptions.signal` 만 provider 가 **반드시** 처리해야 한다. 내부 타임아웃과
`AbortSignal.any([timeoutCtrl.signal, options.signal])` 로 합쳐서 둘 중 먼저
발화한 쪽으로 fetch 가 끊기게 한다.

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
} from '@agent-devtools/harness-core';

// Request/response 레인
const openai = createProvider('openai', 'gpt-4o-mini');

// Session 레인 (Claude Code 구독 인증 또는 ANTHROPIC_API_KEY)
const claude = createSessionProvider('claude-agent-sdk', 'claude-sonnet-4-5');
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
} from '@agent-devtools/harness-core';

getAvailableProviders(); // -> env 키 기준 ['openai', 'groq', ...]
getAvailableSessionProviders(); // -> ANTHROPIC_API_KEY 가 있으면 ['claude-agent-sdk']
getProviderModels('openai'); // -> 번들된 모델 whitelist
```

이 셋이 widget 에 "지금 어떤 모델과 대화 중인지" 인디케이터를 띄우기 위해
호스트가 마운트하는 `/info` HTTP 엔드포인트의 building block 이다.

## Custom provider 추가하기

자기 호스트 코드에서 `LLMProvider` 인터페이스를 구현하고, factory 를 통해
등록(fork-and-edit)하거나 인스턴스를 harness-core run loop 에 직접 넘긴다.
아래 세 예제는 그대로 복사해서 시작점으로 쓸 수 있는 어댑터다 — 모델
식별자 / 헤더 / 응답 필드명을 자신의 백엔드에 맞춰 바꾸면 된다.

OpenAI 호환 엔드포인트라면 `BaseOpenAICompatibleProvider` 를 상속해도 된다
(`OpenRouterProvider`, `GroqProvider`, `CerebrasProvider` 가 쓰는 그 베이스
클래스). 그 경우 `apiUrl`, `providerName`, `buildHeaders` 만 override 하면
끝난다. 아래 예제는 계약 전체를 한 화면에서 보여주기 위해 standalone 클래스
형태로 작성됐다.

### 예제 1: OpenAI 호환 chat completions

OpenAI 의 `/v1/chat/completions` 모양을 따르는 모든 백엔드를 위한 범용
어댑터 — self-hosted vLLM, Azure OpenAI, Together AI, Fireworks, DeepInfra
등. `baseUrl` 과 인증 헤더만 바꿔주면 동작한다.

```ts
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LLMProvider,
  ToolCall,
  ToolChatResponse,
  ToolDefinition,
} from '@agent-devtools/harness-core';

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly providerName = 'openai-compatible';
  readonly supportsTools = true;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly defaultModel: string,
  ) {}

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = options?.model ?? this.defaultModel;
    const data = await this.post(model, messages, undefined, options);
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`${this.providerName}: empty response from ${model}`);
    }
    return {
      content,
      model,
      ...(data.usage && {
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
      }),
    };
  }

  async chatWithVision(
    messages: ChatMessage[],
    imageContent: { base64?: string; url?: string; mimeType?: string },
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const url =
      imageContent.url ??
      (imageContent.base64
        ? `data:${imageContent.mimeType ?? 'image/png'};base64,${imageContent.base64}`
        : undefined);
    if (!url) {
      throw new Error(`${this.providerName}: image url or base64 required`);
    }
    const augmented = messages.map((m, idx) => {
      const isLastUser = idx === messages.length - 1 && m.role === 'user';
      if (!isLastUser) return m;
      const text = typeof m.content === 'string' ? m.content : '';
      return {
        ...m,
        content: [
          { type: 'text' as const, text },
          { type: 'image_url' as const, image_url: { url } },
        ],
      };
    });
    return this.chat(augmented, options);
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ToolChatResponse> {
    const model = options?.model ?? this.defaultModel;
    const data = await this.post(model, messages, tools, options);
    const msg = data.choices?.[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.function.name, arguments: tc.function.arguments },
    }));
    return {
      content: msg?.content ?? null,
      toolCalls,
      finished: toolCalls.length === 0,
      model,
      ...(data.usage && {
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
      }),
    };
  }

  private async post(
    model: string,
    messages: ChatMessage[],
    tools: ToolDefinition[] | undefined,
    options?: ChatOptions,
  ): Promise<OpenAICompatibleResponse> {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 60_000);
    const signal = options?.signal
      ? AbortSignal.any([timeout.signal, options.signal])
      : timeout.signal;
    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          ...(tools && { tools }),
          max_tokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature ?? 0.1,
        }),
        signal,
      });
      const body = (await res.json()) as OpenAICompatibleResponse;
      if (!res.ok || body.error) {
        const msg = body.error?.message ?? res.statusText;
        throw new Error(
          `${this.providerName} ${res.status} on ${model}: ${msg}`,
        );
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }
}
```

### 예제 2: Anthropic Messages API

Anthropic 의 `/v1/messages` 엔드포인트는 OpenAI 와 모양이 다르다 — `system`
프롬프트가 `messages` 안이 아니라 최상위에 있고, 툴 호출은 `tool_use` 타입의
`content` 블록으로 돌아오며, 툴 결과는 `tool_result` 타입의 `content` 블록으로
다시 보낸다. 아래 어댑터는 `LLMProvider` 의 ChatMessage 배열을 그 모양으로
번역하고, 응답을 다시 평탄화해 돌려준다.

```ts
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ContentPart,
  LLMProvider,
  ToolCall,
  ToolChatResponse,
  ToolDefinition,
} from '@agent-devtools/harness-core';

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string; type?: string };
}

export class AnthropicProvider implements LLMProvider {
  readonly providerName = 'Anthropic';
  readonly supportsTools = true;

  constructor(
    private readonly apiKey: string,
    private readonly defaultModel: string,
  ) {}

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = options?.model ?? this.defaultModel;
    const data = await this.post(model, messages, undefined, options);
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text!)
      .join('');
    if (!text) {
      throw new Error(`${this.providerName}: empty response from ${model}`);
    }
    return {
      content: text,
      model,
      ...(data.usage && {
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          totalTokens:
            (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
        },
      }),
    };
  }

  async chatWithVision(
    messages: ChatMessage[],
    imageContent: { base64?: string; url?: string; mimeType?: string },
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const url =
      imageContent.url ??
      (imageContent.base64
        ? `data:${imageContent.mimeType ?? 'image/png'};base64,${imageContent.base64}`
        : undefined);
    if (!url) {
      throw new Error(`${this.providerName}: image url or base64 required`);
    }
    const augmented = messages.map((m, idx) => {
      const isLastUser = idx === messages.length - 1 && m.role === 'user';
      if (!isLastUser) return m;
      const text = typeof m.content === 'string' ? m.content : '';
      const parts: ContentPart[] = [
        { type: 'text', text },
        { type: 'image_url', image_url: { url } },
      ];
      return { ...m, content: parts };
    });
    return this.chat(augmented, options);
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    options?: ChatOptions,
  ): Promise<ToolChatResponse> {
    const model = options?.model ?? this.defaultModel;
    const data = await this.post(model, messages, tools, options);
    const textBlocks = (data.content ?? []).filter(
      (b) => b.type === 'text' && b.text,
    );
    const toolBlocks = (data.content ?? []).filter(
      (b) => b.type === 'tool_use' && b.id && b.name,
    );
    const toolCalls: ToolCall[] = toolBlocks.map((b) => ({
      id: b.id!,
      type: 'function' as const,
      function: {
        name: b.name!,
        arguments: JSON.stringify(b.input ?? {}),
      },
    }));
    const text = textBlocks.map((b) => b.text!).join('');
    return {
      content: text.length > 0 ? text : null,
      toolCalls,
      finished: toolCalls.length === 0,
      model,
      ...(data.usage && {
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          totalTokens:
            (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
        },
      }),
    };
  }

  private async post(
    model: string,
    messages: ChatMessage[],
    tools: ToolDefinition[] | undefined,
    options?: ChatOptions,
  ): Promise<AnthropicResponse> {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n\n');
    const turns = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content:
          m.role === 'tool'
            ? [
                {
                  type: 'tool_result',
                  tool_use_id: m.tool_call_id,
                  content: typeof m.content === 'string' ? m.content : '',
                },
              ]
            : m.content,
      }));
    const anthropicTools = tools?.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 60_000);
    const signal = options?.signal
      ? AbortSignal.any([timeout.signal, options.signal])
      : timeout.signal;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          ...(system && { system }),
          messages: turns,
          ...(anthropicTools && { tools: anthropicTools }),
          max_tokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature ?? 0.1,
        }),
        signal,
      });
      const body = (await res.json()) as AnthropicResponse;
      if (!res.ok || body.error) {
        const msg = body.error?.message ?? res.statusText;
        throw new Error(
          `${this.providerName} ${res.status} on ${model}: ${msg}`,
        );
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }
}
```

### 예제 3: 로컬 Ollama

[Ollama](https://ollama.com/) 는 모델을 로컬 `http://localhost:11434` 에서
돌린다. `/api/chat` 엔드포인트는 OpenAI 스타일 메시지를 받지만 응답 모양은
다르다 — `{ message: { content }, prompt_eval_count, eval_count }`. 툴 호출은
`llama3.1`, `qwen2.5-coder` 같이 광고하는 모델에서만 동작하고 대다수 로컬
모델은 지원하지 않으므로, 이 어댑터는 `supportsTools = false` 로 두어 하니스가
`chat` 만 호출하도록 한다.

```ts
import type {
  ChatMessage,
  ChatOptions,
  ChatResponse,
  LLMProvider,
  ToolChatResponse,
  ToolDefinition,
} from '@agent-devtools/harness-core';

interface OllamaResponse {
  message?: { role: string; content: string };
  prompt_eval_count?: number;
  eval_count?: number;
  done?: boolean;
  error?: string;
}

export class OllamaProvider implements LLMProvider {
  readonly providerName = 'ollama';
  readonly supportsTools = false;

  constructor(
    private readonly defaultModel: string,
    private readonly baseUrl: string = 'http://127.0.0.1:11434',
  ) {}

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = options?.model ?? this.defaultModel;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 120_000);
    const signal = options?.signal
      ? AbortSignal.any([timeout.signal, options.signal])
      : timeout.signal;
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : '',
          })),
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.1,
            num_predict: options?.maxTokens ?? 4096,
          },
        }),
        signal,
      });
      const body = (await res.json()) as OllamaResponse;
      if (!res.ok || body.error) {
        throw new Error(
          `${this.providerName} ${res.status} on ${model}: ${body.error ?? res.statusText}`,
        );
      }
      const content = body.message?.content;
      if (!content) {
        throw new Error(`${this.providerName}: empty response from ${model}`);
      }
      return {
        content,
        model,
        usage: {
          inputTokens: body.prompt_eval_count,
          outputTokens: body.eval_count,
          totalTokens: (body.prompt_eval_count ?? 0) + (body.eval_count ?? 0),
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async chatWithVision(
    messages: ChatMessage[],
    _imageContent: { base64?: string; url?: string },
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    // Ollama 의 vision 지원은 모델(llava, bakllava ...)마다 다르고, 이미지는
    // 최상위 `images: string[]` (base64) 로 넣는다. 간결성을 위해 이 어댑터는
    // 텍스트 전용으로 폴백한다 — vision 이 필요하면 직접 확장한다.
    return this.chat(messages, options);
  }

  async chatWithTools(
    _messages: ChatMessage[],
    _tools: ToolDefinition[],
    _options?: ChatOptions,
  ): Promise<ToolChatResponse> {
    // `supportsTools = false` 면 하니스가 여기에 도달하지 않는다. 플래그를
    // 무시하는 전략이 있다면 dev 에서 즉시 실패하도록 throw 한다.
    throw new Error(
      `${this.providerName}: tool calling not enabled — set supportsTools = true and implement /api/chat with tools.`,
    );
  }
}
```

### 어댑터를 하니스에 wire 하기

```ts
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';
// ...또는 AnthropicProvider, OllamaProvider — 시그니처는 동일.

const provider = new OpenAICompatibleProvider(
  'https://api.together.xyz',
  process.env.TOGETHER_API_KEY!,
  'meta-llama/Llama-3.1-70B-Instruct-Turbo',
);
```

harness-core 의 run loop 는 provider 이름이 아니라 `LLMProvider` 인스턴스를
받는다. factory 를 우회해서 인스턴스를 직접 넘겨도 된다. 번들된 탐색 API
(`getAvailableProviders`, `getProviderModels`, `/info` 엔드포인트) 가 자기
어댑터까지 알게 하고 싶다면 `packages/harness-core/src/llm/factory.ts` 에
`case` 분기를 추가한다 — 선택사항이다.

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

## 관련 문서

- [어떻게 동작하나](/guides/how-it-works/) — provider 가 dev-server 아키텍처 어디에 위치하는지.
- [Provider — ACP vs SDK](/guides/providers/) — 어느 레인을 언제 쓰는지.
- [권한 모드](/guides/permission-modes/) — provider 가 만드는 툴 호출이 무엇을 할 수 있는지 게이팅하는 action-aware 정책.
- [보안 모델 / Pairing Token](/guides/security/) — pairing token, loopback binding, provider 가 동작하는 보안 경계.
