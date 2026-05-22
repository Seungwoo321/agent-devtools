[English](./README.md) · [한국어]

# @agent-devtools/react

> [agent-devtools](https://github.com/Seungwoo321/agent-devtools) 의 React 19 어댑터 — fiber walker, DOM picker, composer 위젯, closed shadow DOM mount.

**상태:** `0.1.0` — 초기 알파. `1.0` 이전에 API 가 변경될 수 있습니다.

## 무엇이 들어 있나

- **`mountAgentDevtools`** — closed Shadow DOM 안에 launcher + composer 위젯을 mount. 호스트 스타일/이벤트/React 인스턴스가 격리됩니다. `NODE_ENV === 'production'` 에서 throw (`{ force: true }` 로 override 가능).
- **`createDefaultTransport`** — `Authorization: Bearer …` 헤더 + SSE reader. core 에이전트 서버에 연결.
- **Fiber walker + DOM picker** — **Pick** 모드에서 hover 한 요소의 React 컴포넌트 이름, 일부 props, 안정적인 selector 를 추출.
- **Auto context** — picked descriptor, 현재 route, 최근 콘솔 에러를 매 prompt 에 자동 첨부.

## 설치

```bash
pnpm add -D @agent-devtools/react @agent-devtools/core
```

Peer dependencies: `react >= 19`, `react-dom >= 19`.

## 빠른 사용

```tsx
// dynamic import 로 production 번들에서 자체 제거.
if (import.meta.env.DEV) {
  const { mountAgentDevtools, createDefaultTransport } =
    await import('@agent-devtools/react');
  mountAgentDevtools({
    transport: createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: '<시작 시 프로비저닝됨>',
    }),
  });
}
```

Vite 사용자는 위 코드를 직접 작성할 필요가 없습니다 — [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite) 가 dev 시 동일한 부트스트랩을 주입하고 production 에서는 통째로 빠집니다.

## 요구 사항

- Node.js `>= 24.0.0`
- React `>= 19` (dev 빌드 — picker 가 JSX source 정보를 dev runtime 에서 읽습니다)

## 관련 링크

- 모노레포: <https://github.com/Seungwoo321/agent-devtools>
- Core 패키지: [`@agent-devtools/core`](https://www.npmjs.com/package/@agent-devtools/core)
- Vite 플러그인: [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite)

## 라이선스

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
