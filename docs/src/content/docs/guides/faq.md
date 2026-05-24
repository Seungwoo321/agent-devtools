---
title: FAQ
description: 자주 묻는 질문 — 지원 스택, 프로덕션 사용 가능 여부, 팀 단위 도입 가이드.
---

## Q. 어떤 프레임워크 스택을 지원하나요?

**A.** 네 가지 어댑터가 제공됩니다 — **React + Vite**, **Vue 3 + Vite**, **Next.js 15** (App Router + Pages Router), **Nuxt 3**.

각 어댑터는 [`examples/`](https://github.com/Seungwoo321/agent-devtools/tree/main/examples) 에 실행 가능한 예제와, CI 가 강제하는 `smoke:no-leak` 회귀 스캐너를 함께 갖습니다 — 실제 production 산출물 (`dist/`, `.next/`, `.output/`) 을 훑어 widget chain 식별자가 한 번이라도 등장하면 빌드가 실패합니다. 스택별 설치 방법은 [설치 가이드](/guides/installation/) 와 README 의 Packages 표를 참고하세요.

## Q. 프로덕션 환경에서 써도 되나요?

**A.** 안 됩니다. 이건 **내 컴퓨터에서, 개발 중에만 쓰는 로컬 도구** 입니다. 프로덕션 빌드에서는 아예 켜지지 않도록 의도적으로 막아 두었습니다.

**왜 이렇게까지 막을까요.** 이 도구는 AI 에이전트(Claude)에게 프로젝트 코드를 읽고 고칠 수 있는 권한을 줍니다. _나 혼자, 내 PC 에서, 개발 중_ 일 때는 안전하지만 — 만약 이 기능이 라이브로 배포된 환경에서 켜져 있다면, 그 사이트에 접속한 누구나(운영자도 개발자도 아닌, 권한 없는 사용자까지) 서버에 연결된 에이전트를 통해 코드나 서버 자원에 접근·수정을 시도할 수 있게 됩니다. **그런 통로가 프로덕션에 열려 있을 수 있다는 가능성 자체가 보안 사고** 입니다. 그래서 처음부터 로컬(`127.0.0.1`) 전용, 개발 모드 전용으로 설계했습니다.

**게다가 의미도 없습니다.** 설령 가드를 떼어내고 배포 환경에서 돌린다 해도, 그곳에 있는 건 이미 빌드된 산출물뿐입니다. 원본 소스를 고치는 게 아니라서 다음 빌드 때 변경이 그대로 되돌아가고, 프로덕션 빌드에는 "이 화면이 어느 소스 파일인지" 알려주는 정보(개발 전용 디버그 메타)가 없어 에이전트가 어디를 고쳐야 할지조차 알 수 없습니다.

이를 보장하기 위해 누출 방지 guard 가 두 겹 있습니다 (`.claude/rules/dev-only-guard.md`):

- **Layer 1 — 빌드 시점 차단.** Vite 플러그인은 `apply: 'serve'` 로 선언돼 `vite build` 단계에 아예 참여하지 않습니다 ([`packages/vite/src/plugin.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/plugin.ts)). Next / Nuxt 등 후속 어댑터도 같은 원칙으로 production 모드에서는 등록 자체를 건너뜁니다.
- **Layer 2 — 런타임 차단.** `mountAgentDevtools()` 는 `NODE_ENV === 'production'` 이면 즉시 throw 하고, 코어 서버도 production 환경에서는 listen 하지 않습니다 (README "Security defaults").

자동 회귀 가드 ([`packages/vite/src/build-integration.test.ts`](https://github.com/Seungwoo321/agent-devtools/blob/main/packages/vite/src/build-integration.test.ts)) 가 실제 production 빌드 산출물에 위젯 식별자가 한 번도 등장하지 않는지 강제하며, 이 guard 의 회귀는 즉시 release 차단 사유입니다.

## Q. Claude 구독이 없어도 쓸 수 있나요?

**A.** **활성 Claude Pro/Max 구독이 필요** 합니다. 본인 구독으로 직접 호출하는 구조라서, 구독이 없으면 동작하지 않습니다.

자세히는, README 의 "Requirements" 가 Node.js ≥24, pnpm ≥11 과 함께 "활성 Claude Pro/Max 구독 (Agent SDK Credit 포함, 2026-06-15 시행)" 을 전제로 합니다. 이 도구의 비즈니스 모델은 **BYO subscription(본인 구독 사용)** 입니다 — 운영자가 LLM API 키 비용을 떠안지 않고, 사용자가 본인 Claude Pro/Max 구독에 포함된 Agent SDK Credit 으로 직접 호출합니다 (`CONTEXT.md` "결정 로그" 의 "Claude 통신" 항목).

BYOK API 키 provider 와 Ollama / LM Studio 같은 로컬 LLM 옵션은 `CONTEXT.md` 의 "스코프 밖 (후속 milestone)" 에 적혀 있고, 현재는 제공하지 않습니다.

## Q. Stagewise / Cursor 등과 뭐가 다른가요?

**A.** 가장 큰 차이는 **별도의 AI IDE 가 필요 없다** 는 점입니다. agent-devtools 는 브라우저 위젯 안에서 에이전트가 직접 코드를 읽고 고칩니다 — 내용을 IDE 채팅창으로 넘겨주는 방식이 아닙니다.

Stagewise 같은 도구는 Cursor / Windsurf 같은 AI IDE 가 있어야 하고, picked 요소와 메시지를 그 IDE 채팅창으로 forward 합니다. 그래서 응답도 IDE 안에서 확인하고, 작업 내내 브라우저와 IDE 사이를 오가게 됩니다. 비용도 Cursor 구독이나 IDE 쪽 API 키에 묶입니다.

agent-devtools 는 Claude Agent SDK 를 자체 호출해 **위젯 안에서 코드를 읽고 Edit 까지 끝냅니다** (`CONTEXT.md` "유사 도구와 차별화 — Stagewise"). 브라우저만 있으면 되고, 응답도 페이지 위젯 안에서 확인하므로 시선이 브라우저를 떠나지 않습니다. 비용은 본인의 LLM 구독(Claude Pro/Max 등) 하나로 끝납니다. 타겟 사용자는 "AI IDE 없이 VSCode + 브라우저로 개발하는 사람" 입니다.

## Q. 팀 단위로 도입하려면?

**A.** **공유 서버를 두는 게 아니라, 팀원 각자가 본인 PC 에서 본인 구독으로** 돌리는 방식입니다.

자세히는 (README "Security defaults" + `CONTEXT.md` 결정 로그):

- **127.0.0.1 binding** — 로컬 에이전트 서버는 loopback 전용이라 외부 네트워크에 노출되지 않습니다. 다른 PC 에서 같은 서버를 호출할 수 없습니다.
- **페어링 토큰** — CLI 시작마다 회전, 메모리 only, 디스크 미저장, URL embed 금지. 토큰은 dev HTML 의 `window.__AGENT_DEVTOOLS_CONFIG__` 와 `Authorization: Bearer` 헤더로만 전달됩니다 (README "Quick Start").
- **BYO subscription** — 각 개발자가 본인 Claude Pro/Max 구독으로 호출하므로, 팀 도입은 곧 "팀원 N 명이 각자 본인 PC 에 Vite 플러그인을 dev dependency 로 추가하고 본인 구독으로 사용" 입니다 (`CONTEXT.md` "정체성").

조직 차원에서 공유 LLM proxy / 서버를 운영하는 시나리오는 `CONTEXT.md` 의 "스코프 밖 (후속 milestone)" 에 적힌 인증 SaaS 경유 모드 (post-MVP) 영역이고, 현재 스코프에는 없습니다.

## Q. 페이지 데이터가 외부로 나가나요?

**A.** 에이전트가 바깥으로 연결하는 곳은 **Claude(Anthropic API) 한 곳뿐** 입니다. 나머지는 전부 내 컴퓨터 안에서 돕니다.

자세히는, 에이전트가 호출하는 외부 endpoint 는 Claude Agent SDK 의 Anthropic API 하나뿐입니다 (`CONTEXT.md` "결정 로그" 의 "Claude 통신" 항목 — 사용자 OAuth → 본인 구독 토큰 → SDK 직접 호출). 로컬 에이전트 서버는 `127.0.0.1` 루프백에만 bind 되어 외부 네트워크에 노출되지 않습니다. 페어링 토큰은 디스크에 저장되지 않고 메모리에만 살며, 브라우저 히스토리 / 서버 로그 / Referer 헤더로 새지 않도록 URL 임베드가 금지돼 있습니다 (README "Security defaults", `CONTEXT.md` 결정 로그).

호스트 앱과 widget 은 **closed Shadow DOM + 별도 React 모듈 인스턴스** 로 분리돼 있어, widget 이 호스트 앱의 상태 / 컨텍스트 / 글로벌 스타일을 임의로 읽어가는 경로도 없습니다 ([`.claude/rules/adapter-discipline.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/adapter-discipline.md) "격리 (host app 안전)").

## Q. 라이선스는?

**A.** [MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) 입니다. 누구나 자유롭게 쓰고, 포크하고, 수정할 수 있습니다.

README "License" 와 `CONTEXT.md` "정체성" 모두 MIT 로 명시합니다 — OSS 표준이고, npm 배포·외부 기여의 마찰을 줄이는 게 결정 사유입니다 (`CONTEXT.md` 결정 로그 "License = MIT").
