# agent-devtools

> 페이지에 떠 있는 floating 채팅창에서 자연어로 코드 수정을 지시하는 in-page agent devtools. BYO LLM 구독 (Claude Pro/Max → Agent SDK Credit). 별도 IDE 불필요.
>
> **프로젝트 정체성 / Phase 0 스코프 / 보안 모델은 `CONTEXT.md` 가 단일 진실원**. 이 파일은 Claude 세션이 작업 시 따라야 할 **레포 고유 규칙** 만 담는다.

상위 가이드 (중복 금지): `~/.claude/CLAUDE.md`, `~/.claude/rules/*`, `~/dev/repository/github/.claude/CLAUDE.md`, `~/dev/repository/github/Seungwoo321/CLAUDE.md`.

## 레포 구조 빠른 참조

```
agent-devtools/
├── packages/
│   ├── core/          @agent-devtools/core         (server + widget shell, framework-agnostic, CLI bin)
│   ├── harness-core/  @agent-devtools/harness-core (LLM provider 추상화 + loop, optional)
│   ├── react/         @agent-devtools/react        (React 19 fiber walker + DOM picker + widget UI)
│   ├── vite/          @agent-devtools/vite         (Vite 8 plugin, dev-only 주입 + 서버 spawn)
│   └── e2e/           @agent-devtools/e2e          (Playwright E2E, private)
├── examples/
│   └── react-vite/    @agent-devtools/example-react-vite (Phase 0 종단 검증 샘플)
├── docs/              Astro Starlight 사용자 가이드 (ko/en)
├── assets/brand/      로고/favicon SSoT
└── CONTEXT.md         프로젝트 정체성 스냅샷 (덮어쓰기 정책)
```

향후 추가 예정 (PLAN-01KS4Q6E9EVSJVDMRFV55XFTEJ): `packages/vue`, `packages/next`, `packages/nuxt`, `examples/vue-vite`, `examples/next`, `examples/nuxt`.

## 작업 명령

```bash
pnpm install              # 워크스페이스 전체 install
pnpm build                # packages/* 빌드 (tsup)
pnpm typecheck            # 전 패키지 tsc --noEmit
pnpm lint                 # eslint .
pnpm test                 # vitest (e2e 제외)
pnpm e2e                  # Playwright (브라우저 사전 설치: pnpm e2e:install)
pnpm --filter @agent-devtools/example-react-vite dev   # 예제 dev 서버
```

엔진 요구: Node `>=24.0.0`, pnpm `>=11.0.0`. `pnpm@11.1.1` 으로 핀.

## 어댑터 작업 규칙

세부 룰은 `.claude/rules/` 분리:

- **`.claude/rules/adapter-discipline.md`** — `@agent-devtools/{프레임워크}` 패키지가 따라야 하는 구조 (peer/dep, exports, walker/picker/widget 분리, core 재사용 원칙).
- **`.claude/rules/picker-strategy.md`** — DOM element → 컴포넌트 정체성 환원의 프레임워크별 walker 전략 + 공통 fallback path + closed shadow root 불변식. 신규 어댑터 picker 작성 시 1차 기준.
- **`.claude/rules/picker-coverage.md`** — picker 가 모든 element 를 받는다는 결정 + 세 케이스별 PickedEvidence 채워짐 매트릭스 (named component / unnamed host fiber / pure host node). 어떤 element 도 reject 하지 않는 정책의 근거.
- **`.claude/rules/dev-only-guard.md`** — production-leak 2-layer guard 계약 (build-time + runtime). 모든 어댑터·번들러 플러그인이 동일하게 준수.
- **`.claude/rules/envelope-conventions.md`** — Clawket task envelope (intent/prompt_template/success_criteria/scenario_id) 작성 규칙. daemon entropy 오탐 회피.

이 룰들은 어댑터 PR 리뷰의 1차 기준이다. 신규 어댑터 작성 세션은 SessionStart 시 자동 주입되니 별도 학습 불필요.

## 변경 작업 시 필수 체크

1. **Clawket 활성 태스크 바인딩** — `~/.claude/rules/clawket-context-management.md` 가 글로벌로 강제. 활성 태스크 없으면 PreToolUse 가드가 차단.
2. **Phased execution** — `~/.claude/rules/mechanical-overrides.md` §2. 한 응답에 5 파일 초과 금지.
3. **타입체크/린트 통과** — `mechanical-overrides.md` §4 forced verification. `pnpm typecheck && pnpm lint` 통과해야 task done 가능.
4. **dev-only guard 회귀 금지** — 어떤 PR 도 production build 산출물에 `@agent-devtools/*` 심볼이 새면 reject. `.claude/rules/dev-only-guard.md` 참조.

## 커밋 규칙

**Claude 는 커밋/푸시하지 않는다.** Seungwoo321 Org wrapper 의 글로벌 규칙 (`~/dev/repository/github/Seungwoo321/CLAUDE.md`) 을 그대로 상속. 사용자가 직접 수행.

현재 git 상태: `git init` 만 된 상태, remote 미연결, 최초 커밋 없음. GitHub 레포 (`Seungwoo321/agent-devtools`) 생성 + remote 추가 + 초기 커밋은 사용자 작업 영역.

## 관련 Plan / 작업 컨테이너

- `PLAN-01KS4Q6E9EVSJVDMRFV55XFTEJ` (draft) — 멀티 프레임워크 어댑터 확장 (Vue/Next/Nuxt). U-META + U0~U4, 25 tasks.
- `PLAN-01KS4BRHGEW9W96J4F2B6EM2AW` (draft) — README 비교표 정리 + CLAUDE.local.md 사적 분석.
- `PLAN-01KRZ62S73X6V2ZNCHBEPG79ZP` — Counter 스타일 원복 + Playwright GIF 데모 (진행 중).
- `PLAN-01KS4WT91PPB669NWNK5RPB60A` — 이 가이드 정비 작업 (현재 active).
