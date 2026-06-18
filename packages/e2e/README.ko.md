[English](./README.md) · [한국어]

# @agent-devtools/e2e

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 예제용 내부 Playwright E2E smoke 스위트.

이 패키지는 **private** 이며 npm 에 publish 되지 않습니다. `examples/react-vite` 앱을 Chromium 에서 구동하고, 두 provider 런타임 모두에 대해 위젯을 end-to-end 로 검증합니다.

## 커버 범위

스위트는 상호 보완적인 두 spec 을 실행합니다.

### `specs/widget-shell.spec.ts` — provider-무관 위젯 셸

이 테스트들은 에이전트 서버를 호출하지 않으므로 인증 상태와 무관하게 통과합니다 — "Vite plugin + bootstrap + mount" 연결을 검증하는 데 알맞은 canary 입니다.

- launcher 가 위젯 host (closed shadow root, 테스트 실행 동안에는 `AGENT_DEVTOOLS_OPEN_SHADOW=1` 로 open 전환) 안에 mount 되고 composer 를 토글합니다.
- gear 아이콘이 stream 뷰를 settings 패널로 교체하며, 둘 중 하나만 한 번에 보입니다 (공유 슬롯).
- settings 패널이 dev 서버가 `/v1/agent/info` 로 보고한 workspace root 를 표시합니다.
- DOM element 를 picking 하면 composer chip 이 컴포넌트-인지 라벨로 채워집니다 — fiber walker 가 composer 의 chip state 에 evidence 를 공급했는지 검증합니다.

### `specs/providers-live.spec.ts` — live provider 왕복

이 테스트들은 live provider 를 호출하며, `claude` CLI 가 인증되지 않은 경우 자동 skip 됩니다. 두 provider 모두 결국 사용자의 Anthropic Pro 5h 쿼터를 소비하므로, rate-limit 윈도우를 무의미하게 증폭시키지 않도록 스위트는 single-worker, single-project 로 실행됩니다.

- **ACP** provider (`@agentclientprotocol/claude-agent-acp`, 로컬 `claude` CLI 에 stdio 로 JSON-RPC) 가 one-shot 프롬프트에 최소 하나의 assistant 메시지로 답합니다. assertion 은 구조적입니다 — user 버블이 나타나고, assistant 버블이 나타나며, error 버블은 렌더되지 않습니다.
- **SDK** provider (`@anthropic-ai/claude-agent-sdk`, in-process `query()`) 가 사용자가 provider radio 를 토글한 뒤 답합니다.
- picked element 가 `POST /v1/agent/stream` 요청 payload 에 전달되며, `tagName`, `outerHTML`, 그리고 (React 19 dev 빌드의 경우) 해상된 `source.fileName` / `source.lineNumber` 를 포함합니다 — React 19 `_debugStack` resolver 의 회귀 방지망입니다.

스위트는 dev-only guard 도 암묵적으로 강제합니다: 테스트 webserver 가 `pnpm --filter @agent-devtools/example-react-vite dev` 를 실행하므로, 위젯 번들이 production 빌드에 새는 회귀는 example 의 smoke 스크립트와 `.claude/rules/dev-only-guard.md` 의 패키지별 guard 가 상류에서 잡습니다.

## 실행 방법

레포 루트에서:

```bash
pnpm install               # workspace install
pnpm e2e:install           # Playwright Chromium 브라우저 다운로드
pnpm e2e                   # 전체 스위트 실행 (dev 서버 자동 spawn)
```

webserver 는 기본 포트 `5183` (`playwright.config.ts` 에 설정) 을 사용하며, 로컬에서는 실행 간에 재사용됩니다 (`reuseExistingServer: true`); CI 는 항상 새 서버를 띄웁니다. 위젯은 테스트 webserver 의 생명주기 동안에만 open shadow root 로 mount 됩니다 — `AGENT_DEVTOOLS_OPEN_SHADOW=1` 은 그 subprocess 로만 한정되며 production 코드에는 절대 설정되지 않습니다.

이 패키지에서 사용할 수 있는 다른 스크립트:

```bash
pnpm --filter @agent-devtools/e2e test           # `playwright test` 의 alias
pnpm --filter @agent-devtools/e2e test:headed    # 보이는 브라우저로 실행
pnpm --filter @agent-devtools/e2e test:ui        # Playwright UI 모드
pnpm --filter @agent-devtools/e2e typecheck      # tsc --noEmit
```

실패 시 trace, screenshot, video 가 `test-results/` 아래에 보존되고, HTML 리포트는 `playwright-report/` 에 생성됩니다.

### Live provider 사전 조건

`specs/providers-live.spec.ts` 는 다음을 요구합니다:

- `PATH` 상의 `claude` CLI.
- `claude` 로 로그인된 Claude Pro/Max 구독 — ACP 와 SDK 모두 인증을 여기에 위임합니다.

이것이 없으면 live spec 은 명확한 메시지와 함께 자동 skip 되며, `widget-shell.spec.ts` 의 셸 spec 은 그대로 실행됩니다.

## 파일

```
packages/e2e/
├── playwright.config.ts     Chromium 전용, single worker, dev 서버 부팅
├── specs/
│   ├── widget-shell.spec.ts     위젯 셸 smoke (provider 인증 불필요)
│   └── providers-live.spec.ts   ACP + SDK 왕복 (claude CLI 없으면 자동 skip)
└── support/
    └── fixtures.ts          공유 WidgetHandle fixture, closed-shadow 헬퍼, hasClaudeAuth()
```

`fixtures.ts` 는 `@playwright/test` 를 `widget` fixture 로 확장해 spec 이 Playwright API 배관이 아니라 user story 처럼 읽히게 하고, composer / stream / settings 패널을 찾기 위한 open-shadow CSS 처리를 한곳에 모으며, live-provider skip guard 를 위한 `hasClaudeAuth()` 를 노출합니다.
