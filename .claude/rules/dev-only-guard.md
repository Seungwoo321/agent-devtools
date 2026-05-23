# Rule: Dev-Only Guard (2-Layer)

agent-devtools 의 코드/widget/server 는 **개발 시점에만 존재** 한다. production 사용자에게 도달하면 보안 사고. 모든 번들러 통합 (Vite, Next, Nuxt module, Webpack, ...) 은 다음 **2 layer guard** 를 동일하게 준수한다.

## Layer 1: 빌드 시점 차단

번들러가 production build 모드일 때, agent-devtools 를 끌어들이는 코드가 **결과 번들에 들어가지 않는다**.

| 번들러       | 구현                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite         | plugin 에 `apply: 'serve'`. `vite build` 는 플러그인을 통째로 무시 → transform 자체가 안 일어남. `packages/vite/src/plugin.ts:110`.                                                                                                                                                                                                                                                                                                                                                         |
| Next.js      | `withAgentDevtools` 가 `next.config` 의 `webpack` 훅에 alias 를 install — `!ctx.dev` (production client build) 일 때 `@agent-devtools/{react,core,harness-core}` 를 `false` 로 alias 하여 widget chain 을 빈 모듈로 치환. 사용자가 `'use client'` 컴포넌트에서 정적 import 한 widget 코드가 production bundle 에 들어오는 것을 차단. bootstrap shim (`@agent-devtools/next/bootstrap`) 자체는 작은 NODE_ENV gate 라 alias 대상에서 제외하고 Layer 2 에 의존. `packages/next/src/config.ts`. |
| Nuxt module  | `defineNuxtModule` setup 에서 `nuxt.options.dev === false` 이면 early return — `addPlugin` 호출조차 하지 않는다.                                                                                                                                                                                                                                                                                                                                                                            |
| Webpack 일반 | dev mode (`mode !== 'production'`) 조건부 entry/plugin. production 에서는 entry 자체에 추가하지 않는다.                                                                                                                                                                                                                                                                                                                                                                                     |

핵심: **production build 시 agent-devtools 의 코드 경로가 그래프에 진입조차 하지 않는다.** import 만 남고 tree-shaking 으로 빠지는 것에 의존하지 않는다.

## Layer 2: 런타임 NODE_ENV gate

만에 하나 Layer 1 이 우회되어 production 번들에 코드가 섞여도, 런타임에서 자기 자신을 차단한다.

- 어댑터의 mount entry (`mountAgentDevtools` 등) 첫 줄에서 `process.env.NODE_ENV === 'production'` 검사 → throw 또는 silent no-op (정책은 throw 권장 — fail-loud).
- core 의 `startAgentDevtoolsServer` 도 동일 검사. 서버가 production 환경에서 절대 listen 하지 않는다.
- `enabled: false` 같은 runtime opt-out 옵션은 Layer 2 와 **별개**. opt-out 은 dev 안에서의 끄기일 뿐, production 차단을 대체하지 않는다.

## 자동 검증

신규 어댑터 + 신규 example 은 다음 두 가지 회귀 가드를 반드시 자동화한다.

1. **dev 주입 확인** — example 의 `pnpm dev` 출력 HTML 에 widget bootstrap script tag 가 존재.
2. **production no-leak 확인** — example 의 `pnpm build` 산출물 (`dist/**` 또는 `.next/` 또는 `.output/`) 의 모든 텍스트 파일을 grep 했을 때 `@agent-devtools` 문자열이 0 회 등장.

이 두 검증은 example 의 smoke script 와 CI 매트릭스에서 동시에 돈다. CI 가 빨갛게 실패하지 않으면 release 금지.

## 페어링 토큰 / 127.0.0.1 / 추가 보안 (참조)

dev-only guard 와는 별 layer지만 같은 정신:

- 에이전트 서버는 `127.0.0.1` 루프백에만 bind (외부 노출 X).
- 페어링 토큰은 메모리에서만 생성, 디스크 미저장. HTML 의 window global 로만 주입 (URL 쿼리 X — 브라우저 히스토리 누출 방지).
- 토큰은 호스트 앱 소스에 절대 박히지 않는다. Vite transform 응답에만 산다.

세부는 `packages/vite/src/plugin.ts` 의 헤더 주석과 `CONTEXT.md` 의 보안 섹션 참조.

## 어겼을 때

- dev-only guard 회귀 = **즉시 release 차단**. 별도 패치 release 대상.
- PR 리뷰에서 1차 reject 사유.
- 자동 회귀 가드를 우회하거나 비활성화하는 변경은 PR 본문에 명시적 정당화 필수 (보통 정당화 불가능).
