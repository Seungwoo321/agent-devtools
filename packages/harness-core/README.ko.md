[English](./README.md) · [한국어]

# @agent-devtools/harness-core

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 도메인-무관 에이전트 하니스 — loop 전략 + LLM provider 추상화. 하위 제품이 자기 도메인을 끼워 넣는 layer.

**상태:** `0.1.0` — 초기 알파. `1.0` 이전에 API 가 변경될 수 있습니다.

## 무엇이 들어 있나

- **Loop 전략** — `orchestrator`, `model-driven`, 그리고 옵션으로 `langgraph` runner. 도메인 코드를 다시 쓰지 않고 실행 형태를 교체할 수 있도록.
- **LLM provider 추상화** — OpenRouter, Groq, Cerebras, OpenAI 호환 엔드포인트용 pluggable provider. `@anthropic-ai/claude-agent-sdk` 와 선택적 통합.
- **도메인 확장 포인트** — `GenerationDomain`, `OperationDomain`, `DomainBinding`, `PromptProvider`, `ToolProvider`. DSL / 비즈니스 룰 / 테넌트 정책 같은 도메인 세부는 의도적으로 비어 있고, consumer 가 주입합니다.

이 패키지는 in-page `@agent-devtools` 위젯 런타임과, dev-only 위젯 layer 없이 같은 하니스만 쓰고 싶은 외부 SaaS consumer 가 공유합니다.

## 설치

```bash
pnpm add @agent-devtools/harness-core
```

선택적 peer 의존성 (실제 사용하는 것만 설치):

- `@anthropic-ai/claude-agent-sdk >= 0.2.140`
- `@langchain/langgraph >= 1.3.0`

## 요구 사항

- Node.js `>= 24.0.0`

## 관련 링크

- 모노레포: <https://github.com/Seungwoo321/agent-devtools>
- Core 패키지: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- 이슈 트래커: <https://github.com/Seungwoo321/agent-devtools/issues>

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
