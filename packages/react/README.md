# @agent-devtools/react

> React 19 adapter for [agent-devtools](https://github.com/Seungwoo321/agent-devtools) — fiber walker, DOM picker, composer widget, closed Shadow DOM mount.

🚧 **Pre-alpha** — Phase 0 (React + Vite + Claude Pro) 종단 검증 단계.

## What's in here

- **`mountAgentDevtools`** — closed Shadow DOM 안에 launcher + composer 위젯 mount. `NODE_ENV === 'production'` 에서 throw (override: `{ force: true }`).
- **`createDefaultTransport`** — `Authorization: Bearer …` 헤더 + SSE 스트림 reader.
- **Fiber walker + DOM picker** — `Pick` 모드에서 hover 한 요소의 React 컴포넌트 이름 / props 일부 / 의미적 selector 추출.
- **Auto context** — picked descriptor + route + recent console errors 등을 자동으로 prompt context 에 동봉.

## Install

```bash
pnpm add -D @agent-devtools/react @agent-devtools/core
```

Peer deps: `react ≥19`, `react-dom ≥19`.

## Quick usage

```tsx
// 권장 패턴 — production 번들에서 dynamic import 자체가 tree-shake 됨.
if (import.meta.env.DEV) {
  const { mountAgentDevtools, createDefaultTransport } =
    await import('@agent-devtools/react');
  mountAgentDevtools({
    transport: createDefaultTransport({
      baseUrl: 'http://127.0.0.1:4317',
      pairingToken: '<프로비저닝 메커니즘으로 전달>',
    }),
  });
}
```

Vite 사용자는 [`@agent-devtools/vite`](https://www.npmjs.com/package/@agent-devtools/vite) 플러그인이 위 mount 호출까지 자동 처리해준다.

## Status & roadmap

전체 컨텍스트는 모노레포 루트 [`README.md`](https://github.com/Seungwoo321/agent-devtools#readme) 참고. Vue / Next / Nuxt 어댑터는 후속 milestone.

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
