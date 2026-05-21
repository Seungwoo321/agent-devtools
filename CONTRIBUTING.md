# Contributing to agent-devtools

먼저 관심 가져주셔서 감사합니다. 이 문서는 외부 기여자와 메인테이너 양쪽을 위한 작업 가이드입니다.

## Status

🚧 **Pre-alpha** — public contribution 을 본격적으로 받기 전 단계입니다. 큰 변경은 issue 로 사전 논의 부탁드립니다. 토이 PR (오탈자, 작은 문서 개선) 은 환영합니다.

## Project context

작업 시작 전 [`CONTEXT.md`](./CONTEXT.md) 를 먼저 읽어주세요. 프로젝트 정체성, 결정 로그, MVP 스코프가 모두 거기 있습니다. 결정 로그에 어긋나는 PR 은 issue 토론 후로 미뤄집니다.

## Toolchain

| Tool       | Version            |
| ---------- | ------------------ |
| Node.js    | ≥24 (LTS)          |
| pnpm       | ≥11                |
| TypeScript | 6.x                |
| ESLint     | 10.x (flat config) |
| Prettier   | 3.x                |

`.nvmrc` 가 Node 24 를 지정하므로 `nvm use` 한 번이면 충분합니다.

## Setup

```bash
git clone https://github.com/Seungwoo321/agent-devtools.git
cd agent-devtools
pnpm install
```

Husky pre-commit 훅이 lint-staged 를 통해 변경된 파일만 ESLint + Prettier 로 검사합니다.

## Quality gates

PR 전 로컬에서 통과해야 하는 명령:

```bash
pnpm typecheck    # 전 패키지 tsc --noEmit
pnpm lint         # ESLint flat config
pnpm format:check # Prettier 검사
pnpm test         # 패키지별 테스트
pnpm build        # 패키지별 빌드 (tsup ESM + .d.ts)
```

CI (GitHub Actions) 도 동일 게이트를 통과해야 머지됩니다.

## Testing approach

- **Framework**: [Vitest 4](https://vitest.dev). DOM 환경은 [happy-dom](https://github.com/capricorn86/happy-dom). 추가 mocking 라이브러리 없이 `vi.spyOn` / `vi.fn` 으로 충분합니다.
- **Test location**: `*.test.ts` 가 소스 파일과 같은 디렉토리에 위치 (예: `packages/react/src/picker/picker.test.ts`). 별도 `__tests__` 디렉토리는 쓰지 않습니다.
- **무엇을 테스트하는가**:
  - **소비자 계약** (consumer-facing API surface): 패키지가 export 하는 함수/타입의 동작.
  - **보안 경계**: HTTP gate, NODE_ENV guard, 페어링 토큰 검증, production 누출 — 단위 테스트 + end-to-end forgery 테스트 둘 다 (`packages/core/src/server/pairing-token.test.ts` 참고).
  - **번들 출력**: `packages/vite/src/build-integration.test.ts` 처럼 실제 Vite `build()` 를 돌려 production 출력에 widget 식별자가 없는지 확인하는 "infrastructure" 테스트도 동일 폴더에 둡니다.
- **happy-dom 한계**: pointer event flow, `elementFromPoint` 등 일부 DOM API 는 stub 입니다. 그 부분이 필요하면 `vi.spyOn(document, 'elementFromPoint').mockReturnValue(target)` 같이 명시적으로 stub 합니다.
- **Port flakiness**: 로컬 서버 단위 테스트는 OS-assigned ephemeral port (`port: 0`) 가 디폴트입니다. 연속된 free port 가 필요하면 `packages/core/src/server/server.test.ts` 의 retry 패턴을 따라가세요.
- **Vitest 안에서 `vite.build()` 호출**: vitest 가 `NODE_ENV=test` 를 세팅하기 때문에 그 상태로는 Vite 가 `import.meta.env.DEV` 를 `false` 로 fold 하지 않습니다. `vite build` CLI 와 동일한 조건을 만들고 싶다면 `packages/vite/src/build-integration.test.ts` 의 `buildAsProduction()` shim 처럼 호출 직전 `NODE_ENV` 를 `'production'` 으로 바꿨다가 `finally` 에서 복원하세요.

## Workspace layout

```
packages/
├── core/    @agent-devtools/core   (framework-agnostic)
├── react/   @agent-devtools/react  (peerDeps: react ≥19, react-dom ≥19)
└── vite/    @agent-devtools/vite   (peerDeps: vite ≥8)
examples/
└── react-vite/  Phase 0 종단 검증 샘플
```

새 어댑터 패키지 (vue/next/nuxt) 는 후속 milestone 입니다 — 사전 issue 없이 PR 으로 추가하지 말아주세요.

## Coding conventions

- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. 우회 (`as any`, `@ts-ignore`) 는 PR 설명에 사유 필수.
- ESLint `@typescript-eslint/consistent-type-imports` — 타입은 `import type` 분리.
- React 19 + closed Shadow DOM 으로 widget 렌더. 호스트 앱과 React 인스턴스 공유 금지.
- Tailwind v4 PostCSS 빌드 결과는 Shadow DOM 내부에만 주입. 전역 CSS 누출 금지.

## Security

- production 누출 0 이 디폴트입니다. 모든 widget·서버 코드는 `process.env.NODE_ENV !== 'production'` 게이트 필수.
- 페어링 토큰: 메모리 only, CLI 시작마다 회전, 디스크 미저장, URL embed 금지.
- 127.0.0.1 외 binding 금지 (외부 노출 차단).
- `.env`, `*.key`, `*.pem` 류는 `.gitignore` 에 이미 반영. 절대 commit 금지.

보안 이슈는 공개 GitHub issue 가 아니라 메인테이너에게 비공개로 보고해주세요.

## Commit / PR

- Conventional Commits 권장 (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- PR 제목 70자 이내, 본문에 "왜 이 변경이 필요한가" 를 우선 기술.
- 결정 로그 변경을 동반하는 PR 은 `CONTEXT.md` 의 "결정 로그" 섹션도 같은 PR 에서 snapshot 갱신.

## License

기여하신 코드는 [MIT License](./LICENSE) 로 배포됩니다.
