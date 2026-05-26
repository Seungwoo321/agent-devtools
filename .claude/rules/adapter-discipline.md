# Rule: Adapter Discipline

`@agent-devtools/{framework}` 패키지 (`react`, `vue`, `next`, `nuxt`, ...) 는 다음 규약을 따른다.

## 패키지 메타

- 이름: `@agent-devtools/<framework>` — npm 공개 스코프 고정.
- `private` 금지 (publishable). examples 는 예외 (`private: true`).
- `engines.node`: 최소 `>=22.13.0` (LTS Jod) — 워크스페이스 루트와 통일.
- `type: "module"` 고정. CJS 산출물 만들지 않는다.
- 빌드: `tsup` (워크스페이스 통일). 산출물은 `dist/`. `files` 필드에 `dist`, `README.md` 만 포함.
- `exports` 맵: `.` 가 기본 진입점, 보조 진입점 (예: `./server`, `./app-router`) 만 추가. `main`/`module`/`types` 도 함께 둔다 (구버전 번들러 호환).
- `repository.directory`: 패키지 경로 (`packages/<name>`) 명시.

## 의존성 경계

- **core 는 framework-agnostic** (`@agent-devtools/core`). 어댑터에서 React/Vue/Next/Nuxt 런타임을 core 로 끌어들이지 않는다.
- 어댑터의 framework 런타임은 **peerDependency** 로만 선언. `react >=19.0.0`, `vue >=3`, `next >=15`, `nuxt >=3`. 어댑터가 자기 framework 를 dep 으로 깔지 않는다 — 호스트 앱의 버전을 따라간다.
- `@agent-devtools/core` 는 어댑터의 `dependencies` 에 `workspace:*` 로 들어간다.
- 다른 어댑터 재사용 (예: Next 가 React 재사용, Nuxt 가 Vue 재사용) 은 **workspace dependency 로 명시** 하고 re-export 한다. 코드 복제 금지.

## 어댑터 내부 모듈

표준 모듈은 다음 3 종이고, 모두 framework 별 구현이지만 **공개 API 모양은 동일** 해야 widget UI 가 한 인터페이스로 양쪽을 소비할 수 있다.

| 모듈                   | 책임                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `fiber/` 또는 `vnode/` | DOM element → 컴포넌트 인스턴스 → `{ file, line, name }` 추출                                                         |
| `picker/`              | hover/click 으로 element 선택, 위 walker 호출, 결과 이벤트 emit                                                       |
| `widget/`              | 호스트 페이지에 **closed shadow root** 부착, framework 네이티브 컴포넌트로 widget UI 렌더, core 와 wire 프로토콜 통신 |

추가 모듈 (composer, launcher, settings 등) 은 widget UI 의 하위 부품이므로 widget/ 안에서 자유 구성.

walker 의 프레임워크별 전략 + 공통 fallback path + closed shadow root 불변식은 별도 룰로 분리: `./picker-strategy.md`.

## 격리 (host app 안전)

- widget UI 는 **반드시 closed shadow root** 안. (테스트용 open shadow 는 `AGENT_DEVTOOLS_OPEN_SHADOW=1` 환경변수로만 가능, 기본은 closed.)
- 호스트 페이지의 글로벌 스타일/이벤트와 분리. 어떤 CSS variable 도 호스트로 새지 않는다.
- picker overlay 는 shadow root 밖 (호스트 DOM 위) 에 둘 수 있으나, 호스트 이벤트 흐름을 막지 않는다 (`pointer-events` 신중 처리).
- React/Vue 의 경우 dual tree 격리: 호스트 앱의 React/Vue 인스턴스와 widget 의 React/Vue 인스턴스는 **별개 root** 여야 한다. 호스트 컨텍스트(Provider/Pinia/...)에 의존하지 않는다.

## 신규 어댑터 추가 절차

1. `packages/<framework>/` 디렉토리 생성, 위 메타 규칙으로 `package.json` 작성.
2. `tsconfig.json` 은 워크스페이스 base 확장.
3. `src/index.ts` 에서 공개 API export (`mount`, `picker`, `walker`, 등).
4. `@agent-devtools/vite` 의 `resolveAdapter` 휴리스틱에 자기 패키지명 등록 (Vite 어댑터-aware 일반화 이후).
5. `examples/<framework>-<bundler>` 추가, 종단 smoke (`dev` 주입 확인 + production no-leak 확인).
6. `.changeset` 추가, CI 매트릭스 entry 추가.
7. `dev-only-guard.md` 의 2-layer 계약을 자기 번들러 통합에도 똑같이 적용.

## 금지

- 어댑터에 비즈니스 로직 / LLM provider 호출 직접 구현. 그 책임은 `@agent-devtools/core` 와 `@agent-devtools/harness-core` 에 있다.
- core 가 import 되는 코드에서 React/Vue 등 framework 런타임 사용.
- 어댑터 간 직접 import 우회 (예: Next 가 React 어댑터의 internal 파일 직접 import). 항상 공개 entry 만 사용.
