# Rule: Picker Coverage — Pick Anything, Resolve What We Can

agent-devtools 의 picker 는 **모든 DOM element 를 받는다**. 프레임워크의 walker 가 풀어내지 못해도 reject 하지 않는다. metadata 가 부족한 element 도 그 element 로서 가치를 가진다.

이 룰은 `picker-strategy.md` 의 fallback path 절을 "현재 picker 가 실제로 무엇을 반환하는가" 의 관점에서 풀어쓴 결정 기록이다. 신규 framework 어댑터 picker 가 이 계약을 지켜야 한다.

## 결정 한 줄

**Picker 는 절대 element 를 reject 하지 않는다. 항상 PickedEvidence 를 만든다. 풀어낸 만큼만 채우고 나머지는 비운다.**

## 현재 동작 — React 어댑터 (코드 기준)

`packages/react/src/context/picked.ts:52` `describePicked(element, options)` 는 어떤 element 에 대해서도 PickedEvidence 를 빌드한다. fiber 가 있든 없든:

```ts
const fiber = getFiberForElement(element); // 없으면 null
const componentName = fiber
  ? resolveComponentName(fiber)
  : element.tagName.toLowerCase();
// ...
const source = resolveFiberSource(fiber);
if (source) result.source = source; // 없으면 omit
// componentChain 도 fiber 가 null 이면 빈 배열
```

`packages/widget-core/src/picker/picker.ts:83` `onClick` 도 단순히 `dispatch({ type: 'pick', target })` 만 한다. `shouldSkip` predicate 외엔 거르지 않는다 — 즉 **widget 자기 DOM 만 빼면 무엇이든 pick 가능**.

따라서 세 케이스의 결과는 다음과 같다.

### Case A — Named component (full resolution)

예: 사용자가 `<TodoItem>` 컴포넌트의 `<button>` 클릭

- `getFiberForElement(button)` → fiber 반환 (host fiber, type === 'button')
- `walkComponentAncestors(fiber, { maxDepth: 10 })` → 가까운 named ancestor `TodoItem` 부터 leaf-first 수확
- `resolveComponentName(fiber)` → 'button' (호스트 fiber 의 string type)
  - **단**, picker UX 상 사용자가 보는 chip 은 보통 첫 named ancestor 의 이름을 부각시킨다 — widget 측 UI 정책. PickedEvidence 자체는 leaf fiber 의 이름 그대로.
- `resolveFiberSource(fiber)` → `{ fileName: 'src/TodoItem.tsx', lineNumber: 23, columnNumber: 5 }`
- `componentChain` → `[{ componentName: 'TodoItem', source: { ... } }, { componentName: 'TodoList', source: { ... } }, { componentName: 'App', source: { ... } }]`
- outerHTML / attributes / selector / boundingRect / propsSnapshot 전부 채워짐.

**메타데이터 풍부도**: 최대.

### Case B — Unnamed host fiber (e.g. JSX `<div>` 안의 또다른 `<div>` — anonymous host wrapper)

예: 사용자가 `<App>` 안에 직접 박힌 `<div className="container">` 클릭

- `getFiberForElement(div)` → host fiber 반환 (type === 'div', 함수형 컴포넌트 아님)
- `resolveComponentName(fiber)` → 'div' (소문자 tag string 그대로 반환됨, `component-name.ts:21`)
- `resolveFiberSource(fiber)` → React 19 dev 빌드라면 `_debugStack` 에서 JSX 호출 site 추출 성공 → `{ fileName: 'src/App.tsx', lineNumber: 12 }`. React ≤18 이면 `_debugSource` 가 있을 수도 있음. 라이브러리 pre-transpiled JSX 면 둘 다 없음 → omit.
- `walkComponentAncestors(fiber)` → host fiber 는 skip 하고 `.return` 사슬에서 named ancestor 만 수확 → `[{ componentName: 'App', source: ... }]` 정도.
- outerHTML / attributes / selector / boundingRect 모두 채워짐. propsSnapshot 은 host fiber 의 memoizedProps (className, children 등) 가 있으면 serialize.

**메타데이터 풍부도**: 중간 — 정확한 line:column 까지 잡히지만 chip 라벨이 "div" 라 시각적으로 약해 보임. widget 측 UI 가 chip 에 첫 named ancestor 를 함께 보여줘서 정체성 보강.

### Case C — Pure host node, no React owner (e.g. 브라우저 익스텐션 주입 element, static HTML 영역, 다른 framework 가 그린 영역)

예: 사용자가 React root 밖의 `<header>` 클릭, 또는 어드블록 익스텐션이 주입한 `<div id="adblock-...">` 클릭

- `getFiberForElement(target)` → null (`__reactFiber$<nonce>` property 없음)
- `componentName = element.tagName.toLowerCase()` → 'header'
- `resolveFiberSource(null)` → undefined → `source` 필드 omit
- `componentChain` → 빈 배열
- outerHTML / attributes / selector / boundingRect / id / className 채워짐. text 도 textContent 가 있으면 채워짐. propsSnapshot 만 omit.

**메타데이터 풍부도**: 최소 — 그러나 에이전트 입장에서 outerHTML + selector + id + className + tagName + 텍스트가 있으면 grep 으로 "이 markup 어디 있냐" 를 충분히 찾을 수 있다. 부재 > 추측 원칙대로 잘못된 source 를 만들어내지 않는다.

## 권고 — 현행 유지

이 도구가 따라야 할 모델은 "Pick anything, return best-effort evidence". 다음 두 가지 이유로 restriction 도입을 거부한다.

1. **부재 > 추측 원칙**. 잘못된 fileName/lineNumber 를 보내면 에이전트가 무관한 파일을 수정한다. 비어있는 source 는 에이전트가 outerHTML/selector 로 grep 할 수 있다. picker 가 "이건 못 풀어" 라며 reject 하는 것은 사용자 워크플로우를 끊는 것이지 정확도를 높이는 것이 아니다.

2. **다른 도구의 restriction 은 forwarding 모델의 잔재**. Stagewise 같은 IDE-forwarding 도구는 picked element 의 source 가 IDE 채팅창으로 그대로 전송된다 — source 가 없으면 IDE 가 받아 처리할 게 없으니 UX 상 "pickable 하지 않다" 가 정당화된다. agent-devtools 는 **자기 에이전트가 picked evidence + outerHTML + selector 로 직접 grep** 하므로 source 부재가 dead-end 가 아니다. forwarding 모델의 제약을 답습할 필요 없다.

따라서 **picker 의 element 수락 정책에 추가 제한을 두지 않는다**. 단, 다음 UX 보강은 widget 측 책임으로 분리:

- chip 라벨이 'div' / 'header' / 'Unknown' 인 케이스에서, **첫 named ancestor 의 이름** 을 부제로 함께 보여준다 (widget hover tooltip 에 component chain 이 다 들어가 있음 — `composer.ts` 의 `summarizePicked`).
- source 부재 케이스는 chip 의 source 라인이 "source: (no source available)" 또는 라인 자체 생략. 잘못된 정보 표시 금지.

## 어댑터 PR 리뷰 기준

신규 framework 어댑터 picker 는 다음 단위 테스트가 존재해야 한다.

1. **Case A**: walker 가 named component 를 풀어낸 element 에 대해 picker 가 source + componentChain 을 채운 PickedEvidence 를 반환.
2. **Case B**: host fiber/vnode 만 잡힌 element 에 대해 picker 가 throw 하지 않고, componentName 은 lowercase tag 로, componentChain 은 named ancestors 로 채움.
3. **Case C**: walker 가 null/undefined 를 반환하는 element 에 대해 picker 가 throw 하지 않고, source 와 componentChain 을 omit/empty 로 두되 outerHTML/selector/tagName 은 채움.
4. **widget self-skip**: picker 가 widget 자기 DOM 에 대해 `shouldSkip` 로 silent-skip 함을 검증.

이 4 테스트가 빠진 어댑터 PR 은 reject.

## 변경 정책

이 결정은 **상품 정체성** 에 닿는다 — agent-devtools 가 "IDE 의 입력 보조" 가 아니라 "독립 자기 에이전트" 라는 것의 직접적 귀결이다. 만약 후속 milestone 에서 BYOK API 키 / 로컬 LLM provider 같은 다른 에이전트 backend 가 picked evidence 를 다르게 소비하는 케이스가 생기면, restriction 도입은 그 때 별도 결정 (Clawket `type=decision` artifact) 으로 박는다. 현재로선 모든 케이스에서 best-effort evidence 가 더 낫다.
