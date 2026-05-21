# agent-devtools

OSS React/Vue/Next/Nuxt 용 in-page 에이전트 개발자도구. 사용자 본인의 LLM 구독으로 동작.

> 이 문서는 새 세션이 빈 컨텍스트에서 프로젝트를 픽업할 수 있도록 작성한 **프로젝트 정체성 스냅샷** 입니다. 결정/스코프가 변경되면 본문을 **덮어쓰기** 합니다 (히스토리는 git log / Clawket artifact 로 분리).

## 한 줄 요약

브라우저에서 개발 중인 페이지에 떠 있는 floating 채팅창. 사용자가 자연어로 UI/기능 수정을 요청하면, **그 채팅창 안에서 직접** 에이전트가 코드를 읽고 수정한다. 별도 IDE 가 필요 없다.

## 정체성

- React DevTools / TanStack Query DevTools 와 같은 **개발자도구 카테고리** 의 OSS.
- 단, 기능은 **로컬 LLM 에이전트 호출 + 코드 수정**.
- 비즈니스 모델: **BYO subscription**. 사용자가 본인의 Claude Pro/Max (또는 다른 구독) 으로 동작시킨다 — 운영자가 API 비용을 떠안지 않는다.
- 라이선스: MIT.

## 유사 도구와 차별화 — Stagewise

OSS, 거의 같은 컨셉의 floating widget + 요소 picker (https://stagewise.io). **결정적 차이**: Stagewise 는 LLM 을 자기가 호출하지 않고, picked 요소 + 메시지를 Cursor / Windsurf / Claude Code 같은 외부 AI IDE 채팅창으로 forward 한다. 즉 IDE 가 본체, Stagewise 는 입력 보조.

|           | Stagewise                   | agent-devtools                      |
| --------- | --------------------------- | ----------------------------------- |
| 필요 도구 | Cursor / Windsurf 등 AI IDE | 브라우저만                          |
| 비용 부담 | Cursor 구독 또는 IDE 측 키  | 본인의 LLM 구독 (Claude Pro/Max 등) |
| 응답 위치 | IDE 채팅창                  | 페이지 widget 안                    |
| 시선 이동 | 브라우저 → IDE → 브라우저   | 브라우저에서 끝                     |

**타게팅**: AI IDE 안 쓰고 VSCode + 브라우저로 개발하는 사용자.

## 모노레포 구조

```
agent-devtools/
├── packages/
│   ├── core/              → @agent-devtools/core           (server, widget shell — 프레임워크 무관)
│   ├── harness-core/      → @agent-devtools/harness-core   (LLM provider 추상화 + loop 전략, 도메인 무관)
│   ├── react/             → @agent-devtools/react          (React 19 fiber walker + DOM picker)
│   ├── vite/              → @agent-devtools/vite           (Vite plugin — auto-inject + dev-only 게이트)
│   └── e2e/               → @agent-devtools/e2e            (E2E 검증)
├── examples/
│   └── react-vite/        → Phase 0 종단 검증 샘플
├── docs/                  → 사용자 가이드 사이트 (Astro Starlight, ko/en)
├── assets/brand/          → 로고 / favicon SSoT
├── CONTEXT.md             ← this file
├── pnpm-workspace.yaml
└── package.json
```

TanStack Query 가 동일 패턴 (`@tanstack/query-core` + `@tanstack/react-query` + `@tanstack/vue-query` ...) 으로 검증한 구조. **공통 코어 + 프레임워크 어댑터 N 개**. 페이지 컨텍스트 수집(fiber `_debugSource`, Vue `__vueParentComponent` 등) 은 프레임워크별로 API 가 달라 어댑터 분리가 강제되지만, 나머지 (widget shell / server / agent engine) 는 무관.

## MVP 범위 (Phase 0)

**Phase 0 = "React + Vite + Claude Pro 구독" 으로 종단 검증**.

스코프 안:

- `packages/core` (server + widget shell)
- `packages/harness-core` (provider 추상화 + loop)
- `packages/react` (fiber walker + DOM picker)
- `packages/vite` (auto-inject plugin)
- Claude Agent SDK provider (사용자 본인의 Claude Pro/Max 구독 → Agent SDK Credit 으로 직접 호출, 2026-06-15 시행)
- `examples/react-vite` (사용자 시나리오 검증)
- 보안 게이트 (dev-only, 127.0.0.1, 페어링 토큰)

스코프 밖 (후속 milestone):

- Vue / Next / Nuxt 어댑터
- BYOK API 키 provider (Phase 1)
- Ollama / LM Studio 등 로컬 LLM (Phase 1)
- production 사용 시나리오 (영구 OUT)

## 자동 컨텍스트 수집 (이 도구의 가장 중요한 가치)

터미널 Claude Code 와의 본질적 우위는 "어느 파일인지 찾기" 단계가 사라지는 것:

- **React fiber `_debugSource`** — dev 빌드의 모든 fiber 가 `{ fileName, lineNumber, columnNumber }` 를 들고 있음. fiber 트리 walk 한 번에 "이 페이지를 그린 모든 파일 목록" 확보.
- **DOM picker** — 클릭한 DOM → 가장 가까운 fiber → `_debugSource` → 정확한 component 파일+라인. 그 component 의 import 따라가면 "이 요소 관련 코드 일체".
- **부가 신호** — `window.location.pathname` (라우트 → server 파일 후보), 최근 fetch URL (백엔드 라우트 후보), 콘솔 에러 stack trace 의 file:line, Vite/webpack source map (fiber 가 없는 코드 역추적).

전송 포맷 (예):

```json
{
  "prompt": "이 버튼 hover 시 색을 바꿔줘",
  "auto_context": {
    "picked": "src/runs/playground/composer.tsx:142",
    "page_files": [
      "src/runs/playground/page.tsx",
      "composer.tsx",
      "send-button.tsx"
    ],
    "route": "/runs/playground",
    "console_errors": []
  }
}
```

→ 에이전트는 grep/glob 없이 바로 그 파일들만 Read. 시스템 프롬프트가 페이지 단위로 자동 좁혀진다.

## 브랜드

- 마크 = **Inspect Bracket** (devtools picker 프레임 + 진행 화살표).
- accent = `#4f46e5` (indigo-600).
- SSoT = `assets/brand/` (`logo.svg` / `logo-mono.svg` / `favicon.svg`).

## 결정 로그

| 결정                                                             | 근거                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSS, BYO subscription 모델                                       | API 키 운영 부담 없이 사용자 본인 자원으로 동작. 운영자가 LLM 비용을 떠안지 않는 단일 사용자 도구.                                                                                                                                                                                                              |
| 1 repo, N 패키지 (TanStack 패턴)                                 | 페이지 컨텍스트 수집은 프레임워크 종속 (React fiber vs Vue component tree vs ...). 나머지(widget shell / server / engine) 는 무관 — 공통 코어 + 어댑터 N 개로 갈라야 다언어 지원에 마찰이 없음.                                                                                                                 |
| 첫 타겟 = React + Vite + Claude Pro                              | OSS React 생태계에서 가장 일반적인 빌드 스택. Claude Pro 구독 재사용은 키 발급 부담 0.                                                                                                                                                                                                                          |
| Stagewise 와 차별화 = 자체 에이전트                              | IDE 종속 없이 브라우저에서 응답까지. devtools 카테고리 정체성 강화.                                                                                                                                                                                                                                             |
| 보안 디폴트 = dev-only, 127.0.0.1, 페어링 토큰                   | OSS 라 사용자 디시플린에 의존 불가. production 누출 0 이 디폴트여야 함.                                                                                                                                                                                                                                         |
| npm scope = `@agent-devtools/*`                                  | GitHub org 동명 선점 완료. 개인 scope 보다 프로젝트 정체성 우위.                                                                                                                                                                                                                                                |
| Claude 통신 = **Claude Agent SDK + 사용자 구독 credit**          | 2026-06-15 부 Anthropic 정책으로 Pro/Max 구독에 Agent SDK Credit 이 포함되어 SDK 가 구독 자원으로 직접 동작 (Pro $20 / Max 5x $100 / Max 20x $200, 월 비-rollover, API 단가 기준). default 모드: 사용자 OAuth → 본인 구독 토큰 → SDK 직접 호출. post-MVP: 별도 인증 SaaS 경유 모드 (현재 스코프 외). SDK = MIT. |
| License = **MIT**                                                | OSS 표준, npm 배포·외부 기여 마찰 최소.                                                                                                                                                                                                                                                                         |
| CI = **GitHub Actions**                                          | repo 가 GitHub. 추가 인프라 0.                                                                                                                                                                                                                                                                                  |
| 페어링 토큰 = **CLI 시작마다 회전, 메모리 only, URL embed 금지** | 디스크 저장 시 누출 위험. 세션·PC 단위는 만료 미보장. URL embed 는 브라우저 히스토리·서버 로그·Referer 헤더로 누출.                                                                                                                                                                                             |
| widget 스택 = **React 19 in closed Shadow DOM**                  | 호스트 앱과 별도 React 모듈 인스턴스 + closed Shadow DOM 으로 CSS/DOM·상태 이중 격리. preact/compat 우회는 react-markdown / shiki-react / @floating-ui/react / framer-motion / react-aria 등 React 19 기능 의존 라이브러리 호환성을 깎음. Tailwind v4 PostCSS 빌드 결과는 Shadow 내부에만 주입.                 |

## 참고

- Stagewise: https://stagewise.io (선행 OSS, IDE-forwarding 모델)
- TanStack Query monorepo: https://github.com/TanStack/query (패키지 구조 참고 모델)
- React fiber `_debugSource`: React 16.9+ dev 빌드에서 제공되는 source location 메타
