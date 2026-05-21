---
title: FAQ
description: 자주 묻는 질문 — Vue / Next / Nuxt 어댑터 지원, 프로덕션 사용 가능 여부, 팀 단위 도입 가이드.
---

## Q. Vue / Next / Nuxt 어댑터는 언제 나오나요?

**A.** 현재 공식 패키지는 `@agent-devtools/core`, `@agent-devtools/harness-core`, `@agent-devtools/react`, `@agent-devtools/vite` 4 종이고, `@agent-devtools/next` / `vue` / `nuxt` 는 README 의 패키지 표에서 `planned` 상태로 표시된 **후속 milestone** 입니다. Phase 0 (= "React + Vite + Claude Pro 구독으로 종단 검증") 의 스코프 안에서는 React + Vite 한 조합만 다루고, Vue / Next / Nuxt 어댑터는 명시적으로 **스코프 밖** 으로 정의되어 있습니다 (`CONTEXT.md` "MVP 범위 (Phase 0)" 섹션). Phase 0 종단 검증이 완료된 뒤 [`.claude/rules/adapter-discipline.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/adapter-discipline.md) 의 "신규 어댑터 추가 절차" 에 따라 패키지가 순차적으로 추가됩니다.

## Q. 프로덕션 환경에서 써도 되나요?

**A.** 안 됩니다. `agent-devtools` 는 **dev-only** 로 설계되었고, README 의 "What it is NOT" 에서 `production 사용 가능 (dev-only — 영구 OUT)` 으로 명시됩니다. 누출을 막기 위해 두 겹의 guard 가 있습니다 (`.claude/rules/dev-only-guard.md`):

- **Layer 1 — 빌드 시점 차단.** Vite 플러그인은 `apply: 'serve'` 로 선언되어 있어 `vite build` 단계 자체에 참여하지 않습니다 ([`packages/vite/src/plugin.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/plugin.ts)). Next / Nuxt 등 후속 어댑터도 동일 정신으로 production 모드에서는 entry / plugin 등록 자체를 건너뜁니다.
- **Layer 2 — 런타임 NODE_ENV gate.** `mountAgentDevtools()` 는 `NODE_ENV === 'production'` 에서 즉시 throw 하고, 코어 서버도 production 환경에서는 listen 하지 않습니다 (README "Security defaults").

자동 회귀 가드 ([`packages/vite/src/build-integration.test.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/build-integration.test.ts)) 가 실제 production 빌드 산출물에 `@agent-devtools` 식별자가 0 회 등장하는지 강제합니다. dev-only guard 회귀는 즉시 release 차단 사유입니다.

## Q. Claude 구독이 없어도 쓸 수 있나요?

**A.** Phase 0 시점에는 **활성 Claude Pro/Max 구독이 필요** 합니다. README 의 "Requirements" 가 Node.js ≥24, pnpm ≥11 과 함께 "활성 Claude Pro/Max 구독 (Agent SDK Credit 포함, 2026-06-15 시행)" 을 전제로 합니다. 이 도구의 비즈니스 모델은 **BYO subscription** 입니다 — 운영자가 LLM API 키 비용을 떠안지 않고, 사용자가 본인의 Claude Pro/Max 구독에 포함된 Agent SDK Credit 으로 직접 호출합니다 (`CONTEXT.md` "결정 로그" 의 "Claude 통신 = Claude Agent SDK + 사용자 구독 credit" 항목).

BYOK API 키 provider 와 Ollama / LM Studio 등 로컬 LLM 옵션은 `CONTEXT.md` 의 "스코프 밖 (후속 milestone)" 에 Phase 1 로 적혀 있습니다. Phase 0 동안은 다른 provider 옵션을 제공하지 않습니다.

## Q. Stagewise / Cursor 등과 뭐가 다른가요?

**A.** 가장 큰 차이는 **에이전트를 자기가 호출하는가, IDE 로 forward 하는가** 입니다. README 의 Differentiation 표를 그대로 옮기면:

|           | Stagewise                   | agent-devtools                      |
| --------- | --------------------------- | ----------------------------------- |
| 필요 도구 | Cursor / Windsurf 등 AI IDE | 브라우저만                          |
| 비용 부담 | Cursor 구독 또는 IDE 측 키  | 본인의 LLM 구독 (Claude Pro/Max 등) |
| 응답 위치 | IDE 채팅창                  | 페이지 widget 안                    |
| 시선 이동 | 브라우저 → IDE → 브라우저   | 브라우저에서 끝                     |

Stagewise 는 picked 요소 + 메시지를 외부 AI IDE 채팅창으로 forward 하는 입력 보조 도구지만, `agent-devtools` 는 Claude Agent SDK 를 자체 호출해 **widget 안에서 코드를 읽고 Edit 까지 완료** 합니다 (`CONTEXT.md` "유사 도구와 차별화 — Stagewise"). 별도 IDE 가 필요 없고, 브라우저 widget 안에서 시선이 떠나지 않습니다. 타겟 사용자는 "AI IDE 안 쓰고 VSCode + 브라우저로 개발하는 사용자" 입니다.

## Q. 팀 단위로 도입하려면?

**A.** **공유 서버 모델이 아니라 각자 본인 PC 에서 본인 구독으로 동작** 시키는 모델입니다. README "Security defaults" 와 `CONTEXT.md` 의 결정 로그를 합쳐 보면:

- **127.0.0.1 binding** — 로컬 에이전트 서버는 loopback 전용이라 외부 네트워크에 노출되지 않습니다. 다른 PC 에서 같은 서버를 호출할 수 없습니다.
- **페어링 토큰** — CLI 시작마다 회전, 메모리 only, 디스크 미저장, URL embed 금지. 토큰은 dev HTML 의 `window.__AGENT_DEVTOOLS_CONFIG__` 와 `Authorization: Bearer` 헤더로만 전달됩니다 (README "Quick Start").
- **BYO subscription** — 각 개발자가 본인 Claude Pro/Max 구독으로 호출하므로, 팀 도입 = "팀원 N 명이 각자 본인 PC 에 `@agent-devtools/vite` 를 dev dep 으로 추가하고 본인 구독으로 사용" 입니다 (`CONTEXT.md` "정체성", README "What it is").

조직 차원에서 공유 LLM proxy / 서버를 운영하는 시나리오는 `CONTEXT.md` 의 "스코프 밖 (후속 milestone)" 에 적힌 별도 인증 SaaS 경유 모드 (post-MVP) 영역이고, Phase 0 스코프에는 포함되지 않습니다.

## Q. 페이지 데이터가 외부로 나가나요?

**A.** 에이전트가 호출하는 외부 endpoint 는 **Claude Agent SDK 의 Anthropic API** 한 곳뿐입니다 (`CONTEXT.md` "결정 로그" 의 "Claude 통신" 항목 — 사용자 OAuth → 본인 구독 토큰 → SDK 직접 호출). 로컬 에이전트 서버는 `127.0.0.1` 루프백에만 bind 되고 외부 네트워크에 노출되지 않습니다. 페어링 토큰은 디스크에 저장되지 않고 메모리에만 살며, 브라우저 히스토리 / 서버 로그 / Referer 헤더로 누출되지 않도록 URL 임베드가 금지되어 있습니다 (README "Security defaults", `CONTEXT.md` 결정 로그).

호스트 앱과 widget 은 **closed Shadow DOM + 별도 React 모듈 인스턴스** 로 dual-tree 격리되므로, widget 이 호스트 앱의 상태 / 컨텍스트 / 글로벌 스타일을 임의로 읽어가는 경로도 없습니다 ([`.claude/rules/adapter-discipline.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/adapter-discipline.md) "격리 (host app 안전)").

## Q. 라이선스는?

**A.** [MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE). README "License" 와 `CONTEXT.md` "정체성" 모두 MIT 로 명시되어 있습니다 — OSS 표준, npm 배포·외부 기여 마찰 최소화가 결정 사유입니다 (`CONTEXT.md` 결정 로그 "License = MIT").
