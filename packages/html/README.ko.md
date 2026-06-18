[English](./README.md) · [한국어]

# @agent-devtools/html

> **plain HTML** 을 [agent-devtools](https://github.com/Seungwoo321/agent-devtools) floating 위젯이 주입된 채로 서빙하는 단일 명령 runner. 프레임워크 없음, 번들러 설정 없음, LLM API 키 연결 없음.

[![npm](https://img.shields.io/npm/v/@agent-devtools/html.svg)](https://www.npmjs.com/package/@agent-devtools/html)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE)

> Dev 전용. runner 가 programmatic Vite dev 서버를 띄우고 위젯을 서빙되는 HTML 에 주입합니다. 파일에는 아무것도 기록되지 않습니다. `@agent-devtools/vite` 플러그인의 `apply: 'serve'` 와 위젯의 런타임 `NODE_ENV` 가드가 이를 엄격히 dev 범위로 유지합니다 — [`dev-only-guard`](https://github.com/Seungwoo321/agent-devtools/blob/main/.claude/rules/dev-only-guard.md) 참고.

정적 HTML 을 편집하는 팀원 (예: Claude Code 로 페이지를 스케치하는 기획자) 에게 in-page 에이전트를 넘겨주기에 이상적입니다.

```bash
# Serve a folder of HTML files (root URL → index.html when present)
npx @agent-devtools/html ./my-pages

# Or point at a single .html / .htm file and land directly on it
npx @agent-devtools/html ./my-pages/about.html
```

출력된 `http://127.0.0.1:…` URL 을 열고, 위젯으로 아무 element 나 pick 한 뒤, 자연어로 변경을 설명하세요. 에이전트가 서빙 폴더의 HTML 파일을 편집합니다.

## 기능

- **Zero-config runner** — 폴더에 대해 programmatic [Vite](https://vite.dev) dev 서버를 띄우고, 기존 [`@agent-devtools/vite`](../vite) 플러그인을 등록하되 `importFrom` 을 framework-agnostic 위젯인 [`@agent-devtools/widget-core`](../widget-core) 로 가리킵니다. 플러그인이 HTML 주입, same-origin proxy, pairing token, production 가드를 프레임워크 어댑터와 정확히 동일하게 처리합니다.
- **Claude Code 세션 재사용** — spawn 된 [`@agent-devtools/core`](../core) 서버가 ACP provider 를 통해 이미 실행 중인 Claude Code 에 닿아 `~/.claude` 세션을 재사용합니다 — 추가 credential 불필요.
- **DOM-only picker** — 프레임워크 owner 가 없으므로 모든 element 가 pickable 하며, 에이전트는 `outerHTML`, unique CSS selector, `tagName`, `id`, `class`, text 를 받습니다. source 파일 / component chain 은 (식별할 대상이 없으므로) 그냥 omit 되며, 에이전트는 markup 을 grep 해 이를 보상합니다.
- **폴더 또는 단일 파일** — 폴더 전체 (MPA 모드, 모든 `*.html` 을 직접 서빙) 나 단일 `.html` / `.htm` 파일을 서빙합니다. 단일 파일의 경우 그 부모 디렉토리가 서빙 workspace 가 되고 출력 URL 이 그 파일을 가리킵니다.
- **CDN `<script>` 보다 안전** — 위젯은 로컬 dev 서버가 주입하며 HTML 파일에 기록되지 않으므로 공개 사이트로 새어 나갈 수 없습니다. 에이전트 서버는 `127.0.0.1` 에만 bind 하고 pairing token 은 메모리에만 존재합니다 (디스크 미저장, URL 미기록).

## 설치

가장 매끄러운 `npx` 경험을 위해, 위젯이 프로젝트의 `node_modules` 에서 resolve 되도록 먼저 dev 의존성으로 설치하세요:

```bash
npm i -D @agent-devtools/html
npx agent-devtools-html ./pages
```

또는 bare `npx @agent-devtools/html` 로 즉석 실행 — 설치 불필요.

## 사용법

```bash
# serve the current directory (root URL → index.html when present)
npx @agent-devtools/html

# serve a specific folder on a fixed port
npx @agent-devtools/html ./pages --port 3210

# serve a single file directly — its parent directory becomes the served
# folder and the printed URL points at the file (e.g. /about.html)
npx @agent-devtools/html ./pages/about.html
```

| 옵션            | 설명                                                             |
| --------------- | ---------------------------------------------------------------- |
| `[path]`        | HTML 파일 폴더 **또는** 단일 `.html` / `.htm` 파일 (기본값: cwd) |
| `--port <n>`    | 선호 포트 (점유 시 Vite 가 다음 빈 포트를 선택)                  |
| `--open-shadow` | 위젯을 open shadow root 로 mount (디버깅용)                      |
| `-h, --help`    | 도움말 표시                                                      |

positional 인자가 단일 파일이면 그 **부모 디렉토리** 가 workspace 로 서빙되고 (형제 asset 이 정상 resolve 되도록) 출력 URL 에 파일의 basename 이 suffix 됩니다. 파일 이름이 `index.html` 일 필요는 없습니다.

### Programmatic API

```ts
import { runHtmlServer } from '@agent-devtools/html';

// Folder form
const { server, url } = await runHtmlServer({ root: './pages', port: 3210 });
console.log(`serving ${url}`);
// later: await server.close();

// Single-file form — pass the parent directory as `root` and the basename
// as `entryFile` so the printed URL lands directly on that page.
const direct = await runHtmlServer({
  root: './pages',
  entryFile: 'about.html',
});
console.log(`serving ${direct.url}`); // → http://127.0.0.1:<port>/about.html
```

CLI 의 `path` 인자 (파일 vs 폴더를 자동 감지) 에는 `resolveEntry` 를 사용하세요:

```ts
import { resolveEntry, runHtmlServer } from '@agent-devtools/html';

const resolved = resolveEntry(process.argv[2] ?? '.');
await runHtmlServer({
  root: resolved.root,
  ...(resolved.entryFile !== null && { entryFile: resolved.entryFile }),
});
```

## 상태

fixed-mode `@agent-devtools/*` 릴리스 라인의 일부로 published. runner 는 `@agent-devtools/vite` 플러그인과 `@agent-devtools/widget-core` 를 그대로 재사용합니다 — 검증된 표면은 `packages/html/src/**/*.test.ts` 참고.

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
