# @agent-devtools/core

> Framework-agnostic core for [agent-devtools](https://github.com/Seungwoo321/agent-devtools) — local agent server, pairing-token auth, widget shell.

🚧 **Pre-alpha** — Phase 0 (React + Vite + Claude Pro) 종단 검증 단계.

## What's in here

- **Local agent server** — loopback-only (`127.0.0.1`), sequential-port fallback, SSE streaming on `/v1/agent/stream`.
- **Pairing token** — CLI 시작마다 회전, 메모리 only, 디스크 미저장, URL embed 금지. `Authorization: Bearer …` 헤더 강제.
- **`agent-devtools` CLI** — `bin/agent-devtools.mjs`. Vite/Next 플러그인이 자동 spawn 하지만 단독 실행도 가능.
- **Production guard** — `NODE_ENV === 'production'` 에서 mount 거부 (override: `{ force: true }`).

## Install

```bash
pnpm add -D @agent-devtools/core
```

대부분의 경우 직접 설치보다 어댑터 (`@agent-devtools/react`) + 빌드 통합 (`@agent-devtools/vite`) 을 통해 transitive 로 받게 된다.

## Status & roadmap

전체 컨텍스트·결정 로그·MVP 스코프는 모노레포 루트 [`CONTEXT.md`](https://github.com/Seungwoo321/agent-devtools/blob/main/CONTEXT.md) 와 [`README.md`](https://github.com/Seungwoo321/agent-devtools#readme) 를 참고.

## License

[MIT](https://github.com/Seungwoo321/agent-devtools/blob/main/LICENSE) © Seungwoo Lee
