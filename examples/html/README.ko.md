[English](./README.md) · [한국어]

# @agent-devtools/example-html

`@agent-devtools/html` 의 종단(end-to-end) 스모크. 프레임워크도 JS 진입점도 없는 순수 정적 HTML 을 `agent-devtools-html` 러너가 서빙하며, 러너는 dev 전용 위젯을 서빙되는 모든 페이지에 주입한다.

## 구성

- `index.html` — 루트 페이지(`Acme Planner · Home`). 정적 마크업이며, 아무 element 나 pick 하면 picker 가 DOM-only 모드(`outerHTML`, selector, `tagName`, `id`, `class`, text)로 해석한다.
- `about.html` — 러너가 index 뿐 아니라 서빙되는 모든 파일에 위젯을 주입함을 증명하는 두 번째 페이지.
- `package.json` — `dev` 스크립트는 `agent-devtools-html . --port 3210` 을 실행한다. build 단계가 없으므로 번들러 플러그인도 없다.

## 실행

```bash
pnpm install
pnpm --filter @agent-devtools/example-html dev
```

dev 서버는 `http://127.0.0.1:3210/` 에서 수신 대기한다. URL 을 열고 아무 element 나 pick 한 뒤 변경을 기술하면 — agent 가 이 폴더의 HTML 파일을 직접 편집한다.

## 프로덕션 누수 없음 스모크

```bash
pnpm --filter @agent-devtools/example-html smoke
pnpm --filter @agent-devtools/example-html smoke:no-leak
```

`smoke` 는 러너를 부팅하고 bootstrap script 태그가 HTTP 로 주입되었음을 단언한다. `smoke:no-leak`(`build:check` 로도 실행)은 어떤 위젯 체인 식별자(`mountAgentDevtools`, `createDefaultTransport`, `@agent-devtools`, `__AGENT_DEVTOOLS_CONFIG__`)도 소스 HTML 에 구워지지 않았음을 단언한다 — 위젯은 러너의 주입된 응답에만 존재하며 디스크에는 절대 없다. 레포 전역 `pnpm smoke:integration` 또한 이 예제의 `dev` 서버를 부팅하여, 모든 프레임워크 어댑터와 함께 HTTP 로 주입을 단언한다.
