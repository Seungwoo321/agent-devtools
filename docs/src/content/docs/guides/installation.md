---
title: 설치
description: Vite + React 프로젝트에 agent-devtools 를 5분 안에 붙이는 방법.
---

이 페이지는 **이미 Vite + React 프로젝트가 있다** 는 전제로 진행한다.
새 프로젝트라면 `pnpm create vite@latest my-app --template react-ts` 로 만든 뒤
돌아오면 된다.

## 0. 전제 조건

다음 두 가지가 이미 준비되어 있어야 한다.

1. **Claude Code CLI 설치 + 로그인.**
   ```bash
   # 한 번도 안 깔았다면
   curl -fsSL https://claude.ai/install.sh | bash
   # 로그인 (Claude Pro / Max 계정)
   claude /login
   ```
   `~/.claude/` 아래에 OAuth 세션 파일이 생기면 준비 완료다.
2. **Node.js 24 LTS 이상.**
   `node --version` 으로 확인.

> agent-devtools 는 Anthropic API 키를 요구하지 않는다. CLI 의 OAuth 세션을
> 그대로 빌려 쓴다.

## 1. 패키지 설치

```bash
pnpm add -D @agent-devtools/vite @agent-devtools/react
# 또는
npm install -D @agent-devtools/vite @agent-devtools/react
```

두 패키지의 역할은 다음과 같다.

| 패키지                  | 역할                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `@agent-devtools/vite`  | dev 서버에 위젯 백엔드 (HTTP + SSE) 를 mount. 로컬 Claude Code 와 stdio JSON-RPC 로 연결. |
| `@agent-devtools/react` | 브라우저에 플로팅 위젯 UI 를 mount.                                                       |

## 2. Vite 플러그인 등록

`vite.config.ts` 에 플러그인을 추가한다.

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { agentDevtools } from '@agent-devtools/vite';

export default defineConfig({
  plugins: [
    react(),
    // 개발 서버에서만 활성화된다. 빌드 산출물에는 포함되지 않는다.
    agentDevtools(),
  ],
});
```

플러그인 옵션은 [구성 레퍼런스](/guides/configuration/) 에서 모두 다룬다.
기본값으로도 동작한다.

## 3. 위젯 마운트

앱의 진입점 (`src/main.tsx` 등) 에서 **개발 모드일 때만** 위젯을 마운트한다.

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.DEV) {
  // 동적 import 로 분리해서 프로덕션 번들에 절대 포함되지 않게 한다.
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

> `import.meta.env.DEV` 가드는 필수다. `mountAgentDevtools()` 자체도 개발용으로
> 만들어졌지만, 번들 사이즈와 보안 측면에서 동적 import 까지 적용하는 것이
> 권장 패턴이다.

## 4. dev 서버 실행

```bash
pnpm dev
```

브라우저 우측 하단에 보라색 동그란 플로팅 아이콘이 보이면 설치 완료다.

처음 클릭하면 페어링 토큰 안내가 잠깐 뜨고, dev 서버 콘솔에 다음과 같은 로그가
찍힌다.

```
[agent-devtools] pairing token (memory-only, rotates per CLI start)
[agent-devtools] provider: acp (default) — connecting to local Claude Code
```

## 5. 다음 단계

- [첫 실행](/guides/first-run/) — 위젯에 첫 프롬프트 보내고 실제 코드 수정이
  일어나는지 확인
- [권한 모드](/guides/permission-modes/) — 매번 승인 묻지 않도록 설정
- [Provider 가이드](/guides/providers/) — SDK 모드로 바꾸기

## 설치가 잘 안 될 때

- **위젯 아이콘이 안 보임** → [문제 해결: 위젯이 안 뜸](/guides/troubleshooting/#위젯-아이콘이-안-보임)
- **`501 agent stream not configured`** → [문제 해결: provider 미설정](/guides/troubleshooting/#501-agent-stream-not-configured)
- **`claude` CLI 가 없다고 나옴** → Step 0 의 CLI 설치를 다시 확인
