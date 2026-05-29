# Rule: Picker Strategy per Framework Adapter

`@agent-devtools/{framework}` 어댑터는 hover/click 으로 잡은 DOM 요소를 **컴포넌트 정체성** (`{ componentName, source: { fileName, lineNumber, columnNumber? }, componentChain, selector }`) 으로 환원해야 한다. 환원 방법은 프레임워크별 런타임이 달라 어댑터마다 walker 가 다르지만, **공개 결과 shape** 은 동일하다. widget UI 는 한 인터페이스로 모든 어댑터 결과를 소비한다.

이 룰은 `.claude/rules/adapter-discipline.md` 의 walker 책임 (`fiber/` 또는 `vnode/`) 을 프레임워크별로 풀어쓴 계약이다.

## 공통 결과 shape (PickedEvidence)

```ts
interface PickedEvidence {
  componentName: string; // walker 가 풀어낸 이름; 미해결 시 'Unknown'
  source?: FiberSourceLocation; // { fileName, lineNumber, columnNumber? } — workspace-relative path
  tagName: string; // 항상 lower-case 호스트 태그 (div, button, ...)
  selector: string; // unique CSS selector fallback
  outerHTML: string;
  componentChain: ComponentChainEntry[]; // leaf → root, max 10 named ancestors
  attributes?: Record<string, string>;
  text?: string;
  id?: string;
  className?: string;
  boundingRect?: DOMRectLike;
  propsSnapshot?: Record<string, unknown>;
}
```

`componentName` / `source` / `componentChain` 의 채워짐 여부가 walker 의 성공/부분실패/실패를 가른다. 셋이 다 비어도 widget 은 `tagName + selector + outerHTML` 로 답한다 — **picker 는 절대 throw 하지 않는다** (Fallback path 절 참조).

## 프레임워크별 walker 전략

### React (`@agent-devtools/react`)

- **DOM → fiber 브리지**: 요소의 own property `__reactFiber$<nonce>` 를 enumerate 해서 fiber 노드 획득 (`packages/react/src/fiber/dom-bridge.ts`). React 17+ 공식-비공식 컨트랙트, React 19 까지 유지.
- **ancestor walk**: fiber 의 `.return` 사슬을 leaf-first 로 따라가며 named component fiber 만 yield (`walkComponentAncestors`, max depth 10). 호스트 fiber (string `type`) 는 skip — 이름 없음.
- **source 추출**: React ≤18 은 fiber 의 `_debugSource` 직접 사용. React 19 는 `_debugSource` 가 제거됐고, JSX 시점에 캡처된 `_debugStack.stack` 의 첫 non-React 프레임을 V8 grammar 로 파싱해 `{ fileName, lineNumber, columnNumber }` 로 환원 (`packages/react/src/fiber/source.ts`).
- **path 정규화**: Vite dev 서버의 `http://host:port/src/App.tsx?t=<bust>` URL → `src/App.tsx` (workspace-relative). `@fs/` 접두는 절대경로로 보존, file:// 은 decode.
- **componentName**: `displayName` → `function.name` → memo/forwardRef wrapper 의 inner type → 'Unknown'.

### Vue (`@agent-devtools/vue` — 예정)

- **DOM → component instance 브리지**: 요소의 `__vueParentComponent` 또는 (Vue 3.5+) `__vnode` 을 own property enumerate 로 찾는다. React 의 `__reactFiber$` 와 같은 정신.
- **ancestor walk**: ComponentInternalInstance 의 `.parent` 사슬을 leaf-first 로 따라가며 named instance 만 yield. `Fragment` / `Suspense` 같은 내장은 skip.
- **source 추출**: SFC 의 경우 `instance.type` 이 `__file` (vite-plugin-vue 가 dev 모드에서 주입) 을 들고 있다. 라인 번호는 vue-template-compiler 가 source map 으로만 제공 — picker 가 직접 line:column 까지 잡기 어렵다. **결정**: `fileName` 은 `__file` 그대로, `lineNumber` 는 source map 으로 후속 해상 (Phase 2). 1차에선 `lineNumber: 1` 로 채우거나 omit.
- **path 정규화**: React 어댑터와 동일 (`toWorkspacePath`) — core 에 이미 있는 유틸 재사용.
- **componentName**: `instance.type.name` → `instance.type.__name` (vite-plugin-vue 가 SFC 이름을 inject) → `__file` 의 basename → 'Unknown'.

### Next.js (`@agent-devtools/next` — 예정)

- **재사용**: 클라이언트 컴포넌트는 그대로 React fiber 트리. `@agent-devtools/react` 의 walker 를 workspace dependency 로 끌어다 그대로 쓴다 (re-export, 코드 복제 금지 — `adapter-discipline.md` §"어댑터 내부 모듈").
- **서버 컴포넌트 / RSC payload 경계**: 서버 컴포넌트 (RSC) 는 클라이언트 fiber 트리에 흔적이 다르다. Next 14+ 의 RSC payload 에는 `__next_internal_action` 메타나 `_payload` 가 들어있지만 source location 은 별도 보장 없다. **결정**: Next 어댑터는 React walker 결과 위에 **JSX source pragma 통합** (`@babel/plugin-transform-react-jsx-source` 가 dev 빌드에서 만든 `__source` prop) 을 fallback 으로 layer 한다 — 즉 fiber 가 못 풀어내면 element 의 React props 에서 `__source` 를 읽어 source 를 채운다.
- **App Router page/layout 추적**: `window.next.router` 의 현재 route 를 picker 결과에 attach (auto_context.route). Picker 자체 책임은 아니지만 RSC 가 정체성을 안 줄 때의 좌표.
- **componentName / componentChain**: React 어댑터와 동일 로직. 서버 컴포넌트는 보통 fiber 가 client 측에서 직접 빌드되지 않아 chain 이 truncate 됨 — 그 자리에 `'(server component)'` placeholder 를 끼우지는 않는다 (정체불명 자리는 빈 채로 둔다, 잘못된 정보보다 부재가 낫다).

### Nuxt (`@agent-devtools/nuxt` — 예정)

- **재사용**: 거의 100% Vue. `@agent-devtools/vue` 의 walker 를 workspace dependency 로 끌어다 쓴다.
- **`#components` auto-import + `useNuxtApp`**: walker 단에선 차이 없음. Nuxt 가 컴포넌트를 globally registered 로 만들어도 instance.type.\_\_file 은 정상으로 박힌다.
- **server route 정보**: Vue 의 `useRoute().path` 를 picker 결과에 attach.

## Fallback path (모든 어댑터 공통)

walker 가 다음 중 하나라도 빈 값을 내면 그 자리만 비우고 나머지로 진행한다 — **picker 는 정체성 부재로 abort 하지 않는다**.

1. **componentName 미해결** → `'Unknown'` 으로 채우고, widget chip 은 `tagName` (e.g. "button") 만 표시.
2. **source 미해결** → `source` 필드 omit. JSX source pragma 가 dev 빌드에서 누락된 케이스, 호스트 element 만 잡힌 케이스, library 가 pre-transpiled JSX 로 배포된 케이스 등.
3. **componentChain 비어있음** → empty array. picker overlay 는 그대로 표시, chip 의 chain tooltip 라인만 사라진다.
4. **모든 walker 결과 부재** → `{ tagName, selector, outerHTML }` 만으로 PickedEvidence 를 만들어 send. 에이전트 측은 selector + outerHTML 로 grep 하는 fallback path 를 가진다.

원칙: **부재 > 추측**. 잘못된 fileName/lineNumber 를 에이전트에 보내면 무관한 파일을 수정한다. 비어있는 source 는 에이전트가 grep 으로 보상할 수 있다.

## Closed shadow root 불변식 (모든 어댑터 공통)

picker overlay 와 widget UI 가 호스트 앱에 누출되는 사고를 막기 위해 다음은 강제다.

- **picker overlay** (hover outline) 는 호스트 DOM 위에 absolute positioned 로 그릴 수 있다. 단:
  - `pointer-events: none` 기본. 호스트 클릭 흐름 막지 않는다.
  - overlay 자체가 picker 의 `shouldSkip` predicate 에 걸려야 한다 — overlay 위로 마우스가 가도 overlay 가 자기 자신을 pick 하지 않는다.
- **widget UI** 는 **반드시 closed shadow root** 안. picker 가 widget DOM 을 잡지 못해야 한다.
  - `shouldSkip` 은 widget host element (shadow root attach 지점) 까지 walk-up 해서 비교. 어댑터 구현은 widget host 의 reference 를 picker 에 넘긴다.
  - `AGENT_DEVTOOLS_OPEN_SHADOW=1` 환경변수가 set 된 경우만 open shadow 허용 (E2E 디버깅 용도). default 는 closed.
- **호스트 focus / scroll containment 무영향**:
  - picker active 동안 호스트 focus 를 가로채지 않는다. Escape 키 listener 는 `capture: true` 로 달되 호스트 keydown 핸들러를 stopPropagation 하지 않는다 (Escape 만 preventDefault).
  - hover/click capture phase listener 는 호스트 scroll container 의 wheel/touchmove 를 막지 않는다.
- **widget input focused 동안 키 이벤트는 호스트로 누출되지 않는다** (closed shadow 의 트리 격리는 이벤트 격리가 아님 — `KeyboardEvent` 는 `composed: true` 라 retarget 후 호스트 document 까지 propagate 된다):
  - 어댑터는 widget shadow host element 의 **bubble-phase** 에서 `keydown` / `keyup` / `keypress` 에 대해 `stopPropagation` 을 호출한다. widget 내부에서 발생한 이벤트가 호스트 document/window 의 bubble-phase listener (Storybook `D`, Notion `/`, VSCode `F1`, `Ctrl+K` 류 글로벌 단축키) 로 전파되지 않게 한다.
  - shadow host 의 bubble-phase 가 widget 내부 listener (composer 의 textarea `keydown` 핸들러 등) 보다 늦게 실행되므로 widget 자체 단축키 처리는 그대로 동작한다. capture-phase 로 부착하면 widget 내부 핸들러를 가로채서 부작용 — bubble-phase 가 정답.
  - **알려진 한계**: 호스트가 `document` / `window` 에 **capture-phase** 로 박은 listener 는 DOM 표준상 widget 어떤 element 의 listener 보다 먼저 실행되므로 widget 측에서 막을 수 없다. 정책상 호스트의 정상적 글로벌 단축키는 거의 모두 bubble-phase 라 실제 부작용은 거의 없으나, capture-phase 호스트 listener 와의 충돌은 알려진 trade-off 로 둔다.
  - picker overlay 의 host document Escape listener (위 항목) 는 widget shadow root **밖** 에 부착되므로 본 격리와 독립 — picker 가 외부에서 처리하는 Escape 흐름은 그대로 유지된다.

## 어댑터 PR 리뷰 기준

신규 프레임워크 어댑터 PR 은 다음을 만족해야 merge.

1. `src/{fiber|vnode}/` 모듈이 DOM → instance 브리지 + ancestor walker + source 추출 + componentName 추출의 **4 책임을 한 모듈씩** 분리한다.
2. picker entry 는 `createPicker({ document, shouldSkip, onPick, onHover, onCancel })` 의 React 어댑터와 동일한 시그니처를 노출한다. widget 측 wire 코드를 재작성하지 않도록.
3. fallback path 4 케이스에 대한 단위 테스트가 존재한다 (각 walker 부재 케이스에서 picker 가 throw 안 함을 명시).
4. closed shadow root 불변식의 자동 회귀 가드 — picker 가 widget DOM 을 잡으려고 시도해도 `shouldSkip` 이 차단함을 e2e smoke 에서 검증.
5. widget input 격리의 자동 회귀 가드 — widget shadow root 안에서 발생한 `keydown` / `keyup` / `keypress` 가 호스트 document bubble-phase listener 에 도달하지 않음을 단위 테스트에서 검증.
6. Re-use 가능한 코드 (예: Next 의 React walker 재사용, Nuxt 의 Vue walker 재사용) 는 workspace dependency 로 명시. 코드 복제 PR 은 reject.

## 변경 정책

이 룰은 picker walker 의 **계약** 이지 walker 구현 detail 은 아니다. 새 React/Vue 버전에서 fiber/vnode 내부 필드가 바뀌면 walker 구현을 **이 룰을 깨지 않는 선에서** 갱신한다. shape (PickedEvidence) 가 바뀌면 widget UI 와 server 송신 포맷이 함께 바뀌므로 별도 결정 (Clawket `type=decision` artifact) 으로 박는다.
