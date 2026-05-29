---
title: 위젯과 페이지 컨텍스트
description: 플로팅 위젯의 UX, 페이지 컨텍스트 자동 첨부, Element Picker 사용 방법.
---

위젯은 호스트 페이지 위에 떠 있는 1인용 채팅 UI 다. 호스트 앱의 React tree
와 완전히 분리된 DOM·스타일·React 인스턴스를 따로 가지고, dev 서버의 에이전트와
HTTP 로 대화한다. 이 페이지는 위젯이 화면에 어떻게 배치되고, 어떤 입력을 받고,
어떤 컨텍스트를 자동으로 모아 프롬프트에 붙이는지 정리한다.

## 위젯 구조 한눈에 보기

위젯은 launcher 버튼 한 개, composer 패널 한 개, 그리고 picker 가 띄우는
overlay 한 개로 구성된다. 각 조각이 호스트 페이지 DOM 안에서 어느 위치에 들어가는지가
격리 모델을 결정한다.

- **Shadow root (`closed`)** — 위젯은 host element `<agent-devtools-widget>`
  하나를 `document.body` 에 붙이고, 그 위에 closed shadow root 를 단다.
  shadow root 안에서는 `:host { all: initial }` 으로 상속 스타일을 끊기 때문에,
  호스트 앱의 CSS 가 위젯을 다시 칠하거나 위젯의 CSS 가 호스트로 새지 않는다.
  closed 모드라 호스트 페이지의 스크립트는 `element.shadowRoot` 로 위젯 내부를
  들여다볼 수 없다 (`packages/widget-core/src/widget/shadow-root.ts:147`).
- **Launcher / composer / settings 는 shadow root 안.** launcher 버튼과
  composer 패널, settings panel 모두 shadow root 안의 `[data-widget-container]`
  요소에 append 된다. `position: fixed` 와 `z-index: 2147483646` 으로 호스트
  레이아웃과 겹치지 않게 stacking context 최상단에 둔다
  (`packages/widget-core/src/widget/shadow-root.ts:121`).
- **Element picker overlay 는 shadow root 밖.** picker 가 hover 요소 위에 그리는
  outline 만은 일부러 `document.body` 직속에 둔다. `pointer-events: none` 으로
  클릭이 통과되도록 하고, `elementFromPoint` 결과에 자기 자신이 끼지 않도록
  배치해서 사용자가 "위젯이 가로막은 요소" 가 아니라 진짜 호스트 요소를 잡을 수
  있게 한다 (`packages/widget-core/src/picker/overlay.ts:69`).
- **Dual React tree.** 위젯 UI 는 호스트 앱의 React root 와 별개의 root 안에서
  렌더된다. 위젯이 호스트의 Provider/Context 트리에 의존하지 않고, 반대로 위젯의
  state 도 호스트로 새지 않는다. `mountAgentDevtools()` 가 launcher / composer /
  settings panel / stream renderer / picker 를 모두 자기 shadow root 위에 직접
  올린다 (`packages/widget-core/src/orchestrator/mount.ts:230`).

## Launcher

플로팅 원형 버튼. 호스트 페이지의 우측 하단에 떠 있고, 클릭하면 composer 가
열리거나 닫힌다.

- **위치와 크기.** 기본 위치는 viewport 우측 하단에서 `{ x: 24, y: 24 }` 만큼
  떨어진 곳, 크기는 48px 원형. `right` / `bottom` 으로 anchor 한다
  (`packages/widget-core/src/launcher/launcher.ts:27`).
- **드래그 이동 + 영구화.** 버튼을 누른 채로 드래그하면 위치를 옮길 수 있고,
  pointerup 시 viewport 경계로 clamp 된 좌표가 `localStorage` 에 저장된다.
  다음 mount 때 같은 자리에서 다시 떠오른다
  (`packages/widget-core/src/launcher/launcher.ts:149`). 창 크기가
  줄어도 화면 밖으로 사라지지 않도록 mount 시점에 viewport 로 한 번 더
  clamp 된다.
- **Click vs drag.** pointer 입력은 순수 reducer (`launcher/state.ts`) 에서
  click / drag 로 분기되고, 실제 click effect 일 때만 `onClick` 콜백이 호출된다.
  드래그 끝의 합성 click 은 reducer 가 삼킨다 — composer 가 의도치 않게 열리지
  않는다 (`packages/widget-core/src/launcher/launcher.ts:140`).
- **클릭 동작.** orchestrator 가 `composer.element.style.display === 'none'`
  으로 현재 가시성을 보고 토글한다. 열릴 때는 `composer.focus()` 까지 호출해서
  바로 입력 가능한 상태로 만든다 (`packages/widget-core/src/orchestrator/mount.ts:405`).
- **Composer 가 launcher 를 따라간다.** 드래그 중에 `onPositionChange` 가 매번
  호출되며 composer 의 `setAnchor` 를 갱신한다. 패널의 우측 모서리는 launcher 의
  우측 모서리와 정렬되고, 패널 하단은 launcher 위로 16px 위에 붙어 있다
  (`packages/widget-core/src/orchestrator/mount.ts:419`).
- **단축키는 별도 없음.** launcher 토글 전역 단축키는 현재 없다. 키보드로 닫는
  유일한 방법은 composer 가 열린 상태에서 `Escape` 를 누르는 것 (composer 만
  닫힘, launcher 는 그대로) 이다.

## Composer

자연어 입력창 + 액션 버튼 + 스트리밍 메시지 뷰가 한 패널 안에 들어 있다.

- **기본 크기와 anchor.** 기본 패널 폭 360px, 높이 420px, 최소 320×240. 8 방향
  resize handle 이 있어 사용자가 잡아당겨 키울 수 있고, 결과 크기는
  `localStorage` 의 `agent-devtools:panelSize` 에 저장된다
  (`packages/widget-core/src/composer/composer.ts:91`).
- **키보드 동작.**
  - `Enter` (Shift 없이) → 텍스트 비어 있지 않고 전송 중이 아니면 submit.
  - `Shift + Enter` → 줄바꿈.
  - `Escape` → composer 만 닫음 (launcher 는 유지)
    (`packages/widget-core/src/composer/composer.ts:541`).
- **Submit 페이로드.** `{ text, picked }` 형태로 orchestrator 에게 전달된다.
  `picked` 는 picker 가 최근에 잡아둔 `PickedEvidence` (없으면 `null`).
  orchestrator 가 prompt 와 `buildPageContext()` 결과를 합쳐 transport 로
  보낸다 (`packages/widget-core/src/orchestrator/mount.ts:508`).
- **전송 중 UI 상태.** transport 가 응답을 시작하면 `setSending(true)` 가 호출되어
  textarea 와 send 버튼이 비활성화된다. 완료/실패 시 `setSending(false)`. 동시에
  여러 요청이 가지 않도록 in-flight `AbortController` 가 새 submit 시 이전
  요청을 abort 한다 (`packages/widget-core/src/orchestrator/mount.ts:487`).
- **스트리밍 응답.** stream renderer 가 composer 패널 안 textarea 위쪽에
  insert 된다. transport 가 SSE/JSON 청크를 `MessageStore.applyEvent()` 로 흘리면
  renderer 가 그대로 그린다 (`packages/widget-core/src/orchestrator/mount.ts:331`).
- **추가 액션.** 컴포저 헤더에는 picker 토글, settings (톱니바퀴), terminal
  handoff (Claude CLI 로 대화 이어받기), new conversation (세션 리셋) 버튼이
  있다. new conversation 은 message store 를 비우고 transport 의 `resetSession()`
  으로 서버측 ACP 세션을 새로 발급한다 (`packages/widget-core/src/orchestrator/mount.ts:560`).

## Settings panel

톱니바퀴 버튼을 누르면 composer 본문이 stream view 에서 settings 로 슬롯
교체된다. 별도 floating dialog 가 아니라 같은 패널 안의 detail view 형태다
(React DevTools / TanStack Query DevTools 의 settings UX 와 같은 패턴)
(`packages/widget-core/src/settings/panel.ts:1`).

설정 항목은 네 종이다.

- **Provider** — 다음 프롬프트를 어느 런타임이 처리할지.
  - `acp` — Claude Code 를 subprocess 로 띄워 ACP 프로토콜로 대화 (기본값).
  - `sdk` — Claude Agent SDK 를 in-process 로 호출.

  서버의 `/v1/agent/info` 응답에 등록되지 않은 provider 는 라디오가 회색으로
  disabled 처리되어, 422 가 뜰 조합을 사용자가 고를 수 없다
  (`packages/widget-core/src/settings/panel.ts:222`).

- **Model** — 프롬프트를 처리할 모델. Claude Code 터미널의 `/model` 메뉴와
  같은 선택지를 노출한다.
  - `default` _(기본값)_ — 모델을 wire 에 싣지 않는 sentinel. 고른 provider
    가 자신의 기본 모델을 그대로 쓴다.
  - `opus` / `sonnet` / `haiku` — 해당 alias 로 고정.

  두 provider 모두 이 alias 를 공유 Claude Agent SDK resolver 로 풀어내므로
  별도의 모델 discovery 왕복이 필요 없다. SDK provider 는 alias 를 `query()`
  의 `model` 옵션으로 넘기고, ACP provider 는 세션 성립 후 프롬프트 전에
  `session/set_model` 로 적용한다 (`packages/widget-core/src/settings/types.ts:31`).

- **Permission Mode** — `requestPermission` 콜백에 대한 일괄 정책. 다섯 가지:
  - `default` — 모든 권한 요청 거절.
  - `acceptEdits` _(기본값)_ — 워크스페이스 안 일상 편집 자동 승인, bash/web
    fetch 등은 별도 동의 필요.
  - `bypassPermissions` — 모든 권한 요청 무조건 허용. 위험도가 높아 settings
    panel 에서만 노출되고 chat composer 의 어떤 버튼으로도 도달할 수 없다
    (`packages/widget-core/src/settings/types.ts:10`,
    `packages/widget-core/src/settings/panel.ts:259`). 행 자체가 빨간 배경으로
    강조된다 (`packages/widget-core/src/settings/panel.ts:163`).
  - `plan` — 읽기 전용 plan 모드.
  - `dontAsk` — `acceptEdits` 와 동일 허용 경로, 모든 프롬프트 표면화 금지.

  자세한 의미는 [권한 모드](/guides/permission-modes/) 참고.

- **Theme** — 위젯 외관. 호스트 페이지와 무관하게 위젯 자신의 테마를 고른다.
  - `auto` _(기본값)_ — OS / 호스트의 `prefers-color-scheme` 을 따라간다.
  - `light` / `dark` — 라이트 / 다크 모드로 고정.

또 한 가지 read-only 정보가 패널 하단에 표시된다.

- **Workspace Root** — 서버가 보고한 워크스페이스 절대경로 (`/v1/agent/info` 의
  `workspaceRoot`). 에이전트가 실제로 읽고 쓰는 루트가 어디인지를 사용자가
  확인하는 용도 (`packages/widget-core/src/settings/panel.ts:187`).

**영구화 범위.** provider, model, permissionMode, theme 는 `localStorage` 키
`agent-devtools:settings` 에 JSON 으로 저장되어 다음 mount 까지 살아남는다
(`packages/widget-core/src/settings/storage.ts:22`). 패널 크기 (composer drag-resize 결과)
는 별도 키 `agent-devtools:panelSize` 에 저장된다. launcher 위치는
`agent-devtools:launcherPosition` 키 (`launcher/storage.ts`). server info
(workspace root, 등록된 provider 목록) 는 매 mount 마다 다시 fetch 되며
저장하지 않는다. 별도 "reset" 버튼은 없고, 영구화된 값을 비우고 싶다면 브라우저
devtools 의 Application 패널에서 해당 키를 직접 지운다.

## Page context auto-attach

사용자가 Pick 으로 따로 element 를 잡지 않아도, 모든 submit 에는 페이지 컨텍스트
스냅샷이 자동으로 첨부된다. orchestrator 가 submit 마다 `buildPageContext()` 를
호출해서 다음 한 묶음을 transport 페이로드에 넣는다
(`packages/widget-core/src/orchestrator/mount.ts:493`,
`packages/widget-core/src/context/build.ts:53`).

`PageContext` 가 담는 필드 (`packages/widget-core/src/context/types.ts:164`):

- `schemaVersion` — 현재 `2`. 서버 prompt formatter 와의 호환성 표시.
- `capturedAt` — 컨텍스트가 모인 epoch ms.
- `url` — `location.href` 통째.
- `route` — `{ pathname, search, hash }`. router 와 무관하게 `window.location`
  에서 추출한다 (`packages/widget-core/src/context/route.ts:19`).
- `pageFiles` — 현재 페이지의 React fiber tree 를 walk 해서 모은 component
  source 파일 목록 `{ fileName, componentName, lineNumber, columnNumber? }`.
  중복 파일은 dedup, 최대 50개로 잘린다. `rootContainer` 옵션으로 받은 React
  root 부터 fiber 를 따라간다 (`packages/react/src/context/build.ts:19`).
- `errors` — `createErrorObserver()` 가 mount 시점부터 수집해 둔 콘솔 에러/예외
  레코드의 최근 50개 (`packages/widget-core/src/orchestrator/mount.ts:250`).
- `picked` — Pick 으로 잡힌 element 가 있을 때만 채워지는 `PickedEvidence`
  (아래 항목 참고).

뷰포트 크기는 별도 필드로 보내지 않는다. picker 가 활성화되어 element 를 잡은
경우엔 `picked.boundingRect` 에 viewport-space 좌표가 들어가지만, 페이지 전체
viewport size 는 page context 에 포함되지 않는다.

## Element picker

화면 위 element 를 가리켜 "이거" 라고 짚을 수 있게 해 주는 hover-and-click
도구. composer 의 picker 토글 버튼이 picker 의 active/idle 상태를 그대로
반영한다.

- **State machine.** picker 는 `idle → active → picked → idle` 의 3-state
  순수 reducer 위에서 돈다 (`packages/widget-core/src/picker/state.ts:8`). active
  중에 click 이 일어나면 곧바로 `picked` 로 전이하고 reducer 는 다시 `idle`
  로 떨어진다 — **한 번에 한 element 만** 잡을 수 있는 단일 선택 모델이다.
  다중 element 동시 선택은 지원하지 않는다.
- **Hover 동작.** active 중에는 mousemove 마다 `document.elementFromPoint` 로
  pointer 아래 요소를 잡고, overlay 가 그 위에 outline 을 그린다. overlay 는
  `pointer-events: none` 이라 hit-test 결과에 자기 자신이 끼지 않는다
  (`packages/widget-core/src/picker/picker.ts:102`).
- **Click 으로 확정.** active 상태에서의 click 은 `preventDefault` +
  `stopPropagation` 으로 호스트 앱에 전달되지 않는다. orchestrator 의
  `onPick` 콜백이 element 를 받아 `describePicked()` 로 `PickedEvidence` 를
  만들고 composer 의 picked chip 으로 노출한다
  (`packages/widget-core/src/orchestrator/mount.ts:385`).
- **Escape 로 취소.** active 중 Escape 키는 picker 를 cancel 시키고 idle 로
  복귀시킨다 (`packages/widget-core/src/picker/picker.ts:93`).
- **Picker 가 위젯 자체를 잡지 않게.** picker 시작 시점에 widget shadow host
  와 그 하위 요소는 `shouldSkip` 으로 걸러진다. picker 가 자기 자신을 잡는
  사고를 막는다 (`packages/widget-core/src/picker/picker.ts:33`).

확정된 `PickedEvidence` 는 단순한 메타데이터가 아니라 evidence-grade 스냅샷이다
(`packages/react/src/context/picked.ts:52`,
`packages/widget-core/src/context/types.ts:79`):

- **Identity** — `componentName`, `tagName`, 최선 노력의 CSS `selector`, JSX
  `__source` pragma 에서 뽑은 `{ fileName, lineNumber, columnNumber? }`.
- **DOM evidence** — `outerHTML` (최대 4096자), `boundingRect`, 모든
  attribute 의 `name → value` 맵, `text` (textContent 첫 120자),
  `id` / `className`.
- **React evidence** — fiber chain 을 위로 올라가며 모은 최대 10개의 named
  ancestor (`componentChain`), 그리고 leaf component 의
  `memoizedProps` 를 sanitised JSON 으로 직렬화한 `propsSnapshot` (functions,
  children, DOM 노드, 순환참조는 elide; 최대 4 KB 문자열).

이 한 묶음이 prompt preamble 에 그대로 박히기 때문에, 에이전트는 follow-up
Read 없이도 "이게 어떤 컴포넌트의 어떤 prop 으로 어떻게 렌더된 element 인지"
를 알고 답변을 시작할 수 있다.
