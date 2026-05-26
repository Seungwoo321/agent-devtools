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
│   ├── core/              → @agent-devtools/core           (server + agent engine + transport, 프레임워크 무관)
│   ├── widget-core/       → @agent-devtools/widget-core    (closed Shadow DOM widget shell, 프레임워크 무관)
│   ├── harness-core/      → @agent-devtools/harness-core   (LLM provider 추상화 + loop 전략, 도메인 무관)
│   ├── react/             → @agent-devtools/react          (React 19 fiber walker + DOM picker + widget UI)
│   ├── vue/               → @agent-devtools/vue            (Vue 3 vnode walker + DOM picker + widget UI)
│   ├── vue2/              → @agent-devtools/vue2           (Vue 2.7 컴포넌트 트리 walker + picker + widget)
│   ├── angular/           → @agent-devtools/angular        (Angular Ivy walker + picker + widget)
│   ├── svelte/            → @agent-devtools/svelte         (Svelte 4/5 `__svelte_meta` resolver + picker + widget)
│   ├── sveltekit/         → @agent-devtools/sveltekit      (SvelteKit layout mount + server `handle` 바인딩)
│   ├── next/              → @agent-devtools/next           (Next.js 15 App Router config wrapper + bootstrap shim)
│   ├── next-pages/        → @agent-devtools/next-pages     (Next.js Pages Router wrapper, `>= 12` 호환)
│   ├── nuxt/              → @agent-devtools/nuxt           (Nuxt 3 module, dev-only client plugin 자동 주입)
│   ├── nuxt2/             → @agent-devtools/nuxt2          (Nuxt 2 module, dev-only client plugin 자동 주입)
│   ├── vite/              → @agent-devtools/vite           (Vite 5–8 plugin — auto-inject + dev-only 게이트, 어댑터-aware)
│   └── e2e/               → @agent-devtools/e2e            (Playwright E2E, private)
├── examples/
│   ├── react-vite/        → React + Vite 종단 샘플
│   ├── vue-vite/          → Vue 3 + Vite 종단 샘플
│   ├── vue2-vite/         → Vue 2 + Vite 종단 샘플
│   ├── angular-vite/      → Angular + Vite 종단 샘플
│   ├── svelte-vite/       → Svelte + Vite 종단 샘플
│   ├── sveltekit/         → SvelteKit 종단 샘플
│   ├── next/              → Next.js 15 App Router 종단 샘플
│   ├── next-pages/        → Next.js Pages Router 종단 샘플
│   ├── nuxt/              → Nuxt 3 종단 샘플
│   └── nuxt2/             → Nuxt 2 종단 샘플
├── docs/                  → 사용자 가이드 사이트 (Astro Starlight, ko/en)
├── assets/brand/          → 로고 / favicon SSoT
├── CONTEXT.md             ← this file
├── pnpm-workspace.yaml
└── package.json
```

TanStack Query 가 동일 패턴 (`@tanstack/query-core` + `@tanstack/react-query` + `@tanstack/vue-query` ...) 으로 검증한 구조. **공통 코어 + 프레임워크 어댑터 N 개**. 페이지 컨텍스트 수집 (React fiber `_debugSource` / `_debugStack`, Vue `ComponentInternalInstance.__file`, Svelte `__svelte_meta`, Angular Ivy 디버그 메타) 은 프레임워크별로 API 가 달라 어댑터 분리가 강제되지만, 나머지 (widget shell / server / agent engine) 는 무관. Next 는 React 어댑터의 fiber walker 를 그대로 재사용하고, Nuxt 는 Vue 어댑터의 vnode walker 를 그대로 재사용 — 메타 어댑터들은 widget chain 코드를 복제하지 않고 workspace dependency 로만 끌어다 쓴다.

## 지원 범위 (snapshot)

**현재 지원 스택**:

| 스택             | 어댑터 패키지                                          | 번들러 통합                                               | Example                 |
| ---------------- | ------------------------------------------------------ | --------------------------------------------------------- | ----------------------- |
| React + Vite     | `@agent-devtools/react`                                | `@agent-devtools/vite`                                    | `examples/react-vite`   |
| Vue 3 + Vite     | `@agent-devtools/vue`                                  | `@agent-devtools/vite`                                    | `examples/vue-vite`     |
| Vue 2 + Vite     | `@agent-devtools/vue2`                                 | `@agent-devtools/vite`                                    | `examples/vue2-vite`    |
| Angular + Vite   | `@agent-devtools/angular`                              | `@agent-devtools/vite`                                    | `examples/angular-vite` |
| Svelte + Vite    | `@agent-devtools/svelte`                               | `@agent-devtools/vite`                                    | `examples/svelte-vite`  |
| SvelteKit        | `@agent-devtools/sveltekit`                            | `@agent-devtools/vite`                                    | `examples/sveltekit`    |
| Next.js 15 (App) | `@agent-devtools/react` + `@agent-devtools/next`       | `@agent-devtools/next` `withAgentDevtools` config wrapper | `examples/next`         |
| Next.js (Pages)  | `@agent-devtools/react` + `@agent-devtools/next-pages` | `@agent-devtools/next-pages` `withAgentDevtools` wrapper  | `examples/next-pages`   |
| Nuxt 3           | `@agent-devtools/vue` + `@agent-devtools/nuxt`         | `@agent-devtools/nuxt` Nuxt module                        | `examples/nuxt`         |
| Nuxt 2           | `@agent-devtools/vue2` + `@agent-devtools/nuxt2`       | `@agent-devtools/nuxt2` Nuxt module                       | `examples/nuxt2`        |

**Provider (LLM 통신)**:

- Claude Agent SDK provider — 사용자 본인의 Claude Pro/Max 구독 → Agent SDK Credit 으로 직접 호출 (2026-06-15 시행).
- ACP provider — 로컬 Claude Code CLI 와 stdio JSON-RPC 로 연결, 사용자의 `~/.claude` OAuth 세션 재사용. 두 provider 모두 모든 어댑터에서 동일하게 동작 (provider 추상화는 `@agent-devtools/core` 안에 있고 어댑터는 widget UI / picker / walker 만 담당).

**보안 디폴트** (모든 스택 공통, 영구 고정):

- dev-only — `vite build` / `next build --production` / `nuxt build` 산출물에 widget chain 코드가 들어가지 않도록 build-time + runtime 2-layer guard 가 강제 (`.claude/rules/dev-only-guard.md`).
- `127.0.0.1` 루프백 bind — 외부 네트워크 노출 차단.
- 페어링 토큰 — CLI 시작마다 회전, 메모리 only, URL embed 금지.
- production 사용 시나리오 — 영구 OUT.

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

## 참고

- Stagewise: https://stagewise.io (선행 OSS, IDE-forwarding 모델)
- TanStack Query monorepo: https://github.com/TanStack/query (패키지 구조 참고 모델)
- React fiber `_debugSource`: React 16.9+ dev 빌드에서 제공되는 source location 메타
