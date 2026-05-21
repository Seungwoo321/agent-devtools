---
title: 문제 해결
description: 자주 마주치는 오류와 그 해결법 — pairing token 불일치, ACP 연결 실패, SDK rate-limit 등.
---

위젯이 떴는데도 응답이 오지 않거나, 위젯 자체가 보이지 않을 때 가장 자주 부딪히는
증상을 모아 둔다. 각 항목은 **증상 → 원인 → 해결** 3 단으로 정리되어 있고, 원인은
실제 소스 파일의 `file:line` 위치를 가리킨다.

## 페어링 토큰 mismatch (401 Unauthorized)

**증상**

- 위젯 composer 에서 프롬프트를 보내면 즉시 에러 아이템이 나타난다.
- DevTools → Network 에서 `/v1/agent/stream` (또는 `/__agent_devtools/...` 프록시
  경로) 응답이 `401 Unauthorized`, body 는 `{"error":"unauthorized"}`, 헤더에
  `WWW-Authenticate: Bearer realm="agent-devtools"` 가 들어 있다.

**원인**

- 서버는 `Authorization: Bearer <token>` 헤더를 `verifyAuthorization` 으로 상수
  시간 비교한다 (`packages/core/src/server/auth.ts:26`). 헤더가 없거나, 스킴이
  `Bearer ` 가 아니거나, 길이가 다르거나, 값이 다르면 그 시점에서 false.
- 401 응답 분기는 `packages/core/src/server/app.ts:286-291` 이 처리한다.
- 토큰은 **CLI 프로세스 시작 시 메모리에서 1 회 생성**되고 디스크에 저장되지 않으며,
  CLI 가 재시작될 때마다 새로 발급된다 (`packages/core/src/server/auth.ts:6-12`).
- Vite 플러그인은 dev 서버를 띄울 때 받은 토큰을 HTML head 의 `window.__AGENT_DEVTOOLS_CONFIG__`
  로만 주입한다 (`packages/vite/src/plugin.ts:186-198`). URL 쿼리에는 절대 박지 않는다.

**해결**

1. 브라우저를 **하드 리로드** (Cmd/Ctrl + Shift + R) 한다. dev 서버가 재시작됐다면
   브라우저가 들고 있는 옛 토큰이 그대로 남아 있을 수 있다.
2. DevTools 콘솔에서 `window.__AGENT_DEVTOOLS_CONFIG__` 를 출력해 본다. `pairingToken`
   필드가 없거나 빈 문자열이면 Vite 플러그인의 `transformIndexHtml` 이 돌지 않은 것 —
   `pnpm dev` 출력 HTML 에 bootstrap script tag 가 있는지 확인한다.
3. Network 탭에서 `/v1/agent/stream` 요청 헤더의 `Authorization` 값을, CLI stdout 에
   찍힌 토큰 (또는 `agent-devtools` 서버를 직접 띄웠을 때 받은 핸들의 `pairingToken`)
   과 글자수까지 일치하는지 비교한다. 길이가 1 자라도 다르면
   `auth.ts:32` 의 length pre-check 에서 reject 된다.

## Claude Code CLI handshake 실패 (ACP 차일드 spawn 직후 즉시 끊김)

**증상**

- 프롬프트 전송 직후 stream 영역에 `acp.error` 아이템이 뜬다. error name 은 보통
  `Error` / `AcpInitializeError` 류, message 는 protocol 초기화 실패 또는 stdio
  파이프 EOF.
- 서버 콘솔 (`pnpm dev` 출력) 에 `[acp-child] ...` 접두가 붙은 stderr 가 흘러나오고
  CLI 가 즉시 종료된다.
- 후속 요청도 같은 에러로 실패한다 (단, 스폰 실패 promise 는 캐시에서 제거돼서
  매번 새로 시도된다).

**원인**

- ACP provider 는 `@agentclientprotocol/claude-agent-acp/dist/index.js` 를 Node 의
  `require.resolve` 로 찾아 host 의 `process.execPath` 로 자식 프로세스를 spawn 한다
  (`packages/core/src/providers/acp-runtime.ts:492-513`).
- 차일드의 stderr 는 `[acp-child] ` 접두를 붙여 그대로 호스트 프로세스 stderr 로
  파이프된다 (`acp-runtime.ts:500-502`) — 실제 에러 원문은 여기서 확인할 수 있다.
- spawn 단계에서 throw 가 발생하면 `AcpSessionPool.getChild` 가 캐시에서 깨진
  promise 를 제거해 다음 요청이 재시도하도록 한다 (`acp-runtime.ts:155-162`).
- spawn 성공 후 `ClientSideConnection.initialize` 가 ACP `PROTOCOL_VERSION` 으로
  핸드셰이크한다 (`acp-runtime.ts:240-247`). 여기서 실패하면 초기 응답을 받지 못하고
  바로 끊긴다.

**해결**

1. 호스트 환경에서 `claude --version` 이 동작하는지 먼저 확인한다 (`~/.claude` 의
   OAuth 자격이 살아 있는지 포함). ACP 차일드는 결국 Claude Code CLI 를 띄우므로
   CLI 자체가 죽어 있으면 핸드셰이크 단계에서 실패한다.
2. 서버 콘솔에서 `[acp-child]` 로 시작하는 stderr 를 그대로 읽는다. 보통 여기에
   `command not found`, `EACCES`, `module not found: @anthropic-ai/claude-agent-sdk`
   처럼 1 차 원인이 그대로 찍힌다.
3. workspace 디렉터리가 실제로 존재하고 읽기 가능한지 확인한다 — ACP 의 `newSession`
   은 cwd 를 인자로 받는다 (`acp-runtime.ts:353`).
4. monorepo 에서 `@agentclientprotocol/claude-agent-acp` 가 부모 워크스페이스에만
   설치돼 있고 example 이 hoist 를 못 받는 경우, `pnpm install` 을 루트에서 다시
   돌려 `require.resolve` 경로를 복구한다.

## Claude Agent SDK quota/credit 소진

**증상**

- SDK provider 사용 중 응답이 시작도 안 되고 즉시 `acp.error` 가 뜬다. error name
  은 SDK 가 던지는 원본 에러 클래스 이름 그대로 노출된다 (예: rate-limit / usage-
  limit / unauthorized).
- 또는 응답이 시작은 됐지만 짧게 끊기고 `acp.result` 의 `stopReason` 이 `cancelled`
  로 들어온다.

**원인**

- SDK provider 는 `@anthropic-ai/claude-agent-sdk` 의 `query()` 를 그대로 호출하고,
  throw 되는 에러를 `toErrorEnvelope` 로 감싸 widget 에 forward 한다
  (`packages/core/src/providers/sdk.ts:86-108`). 즉 SDK 가 던지는 에러 name/message
  가 그대로 stream 에 노출된다.
- SDK 가 던지지 않고 result 메시지의 `subtype` 이 `error_*` 인 경우, 그 turn 은
  `mapResultStopReason` 에서 ACP 의 `cancelled` 로 정규화된다
  (`packages/core/src/providers/sdk-to-acp.ts:165-173`).
- 인증은 `~/.claude` 의 OAuth 자격을 재사용한다 — `ANTHROPIC_API_KEY` 나
  `ANTHROPIC_AUTH_TOKEN` 이 set 돼 있지 않다면 (`packages/core/src/providers/sdk.ts:5-9`).
  Pro/Max 구독의 5 시간 사용량 윈도우는 이 OAuth 채널을 통해 카운트된다.

**해결**

1. 터미널에서 `claude` CLI 를 직접 띄워 동일 계정의 quota 상태를 확인한다. CLI 에서
   같은 에러가 재현되면 위젯 쪽 문제가 아니라 계정 상태 문제다.
2. 5 시간 윈도우가 리셋되기를 기다리거나, 별도 워크스페이스에서 ACP provider
   (`@agentclientprotocol/claude-agent-acp`) 로 전환한다 — 설정 패널의 provider 라디오에서
   `acp` 를 선택하면 차일드가 `claude` 바이너리를 직접 호출하므로 SDK 의 사용량
   계측 경로와 분리될 수 있다.
3. API key 결제로 임시 우회하고 싶다면 dev 서버를 띄우는 셸에 `ANTHROPIC_API_KEY`
   를 export 한 뒤 재기동한다. 단 SDK 가 OAuth 보다 API key 를 우선 사용하므로
   결제 라인이 바뀐다는 점에 유의 (`sdk.ts:5-9`).

## 4317 포트 이미 사용 중 (sequential fallback 동작)

**증상**

- `pnpm dev` 콘솔에 EADDRINUSE 가 직접 찍히지는 않는다. 대신 위젯이 실제로 통신하는
  업스트림 포트가 4317 이 아니라 4318, 4319, ... 처럼 한 단씩 올라간 값이다.
- DevTools Network 의 `/__agent_devtools/...` 응답 헤더에서 동일 origin 으로
  넘어오므로 일반 사용 흐름에서는 거의 보이지 않지만, CLI 를 직접 띄워 쓸 때는
  CLI stdout 의 URL 이 `http://127.0.0.1:<port>` 로 다른 포트를 가리킨다.
- 20 개를 모두 시도해도 모두 점유돼 있으면
  `No free port found in [4317, 4336] on 127.0.0.1` 라는 메시지로 throw 된다.

**원인**

- 서버는 `DEFAULT_PORT = 4317` 에서 시작해 `PORT_FALLBACK_ATTEMPTS = 20` 번까지 한
  포트씩 올려가며 listen 을 재시도한다 (`packages/core/src/server/server.ts:10-11`,
  `server.ts:47-57`).
- 재시도 분기는 `EADDRINUSE` 에만 한정된다 — 그 외 에러는 즉시 propagate 된다
  (`server.ts:53-54`).
- 모든 시도가 실패하면 `[desiredPort, desiredPort + maxAttempts - 1]` 범위를 명시한
  Error 가 throw 된다 (`server.ts:58-59`).
- bind 호스트는 `LOOPBACK_HOST = 127.0.0.1` 로 강제돼 있어 외부 인터페이스로 새지
  않는다 (`server.ts:9`, `server.ts:18-19`).

**해결**

1. `lsof -iTCP:4317 -sTCP:LISTEN` (macOS / Linux) 또는 `netstat -ano | findstr 4317`
   (Windows) 로 4317 을 점유 중인 프로세스를 찾아 정리한다. 보통은 죽지 못한 직전
   세션의 agent-devtools CLI 거나 다른 OTLP-기본-포트 도구다.
2. 점유가 의도된 상황이라면 Vite 플러그인의 `port` 옵션으로 시작 포트를 옮긴다 —
   `agentDevtools({ port: 4400 })` (`packages/vite/src/plugin.ts:82-84`).
3. 20 칸을 다 써서 throw 가 나는 경우, 점유 프로세스가 무한히 누적된 상황일
   가능성이 높다. `ps aux | grep agent-devtools` 로 좀비를 청소한다.

## NODE_ENV=production 환경에서 mount 거부

**증상**

- 위젯이 절대 뜨지 않고, 콘솔에 다음 에러가 출력된다:
  > `agent-devtools: refusing to mount in a production build. This widget is
dev-only. If you really mean it, pass { force: true } — or (recommended)
gate the import behind `import.meta.env.DEV`.`
- 호스트 앱 자체는 정상 동작한다.

**원인**

- `mountAgentDevtools` 의 첫 검사에서 `isProductionBuild()` 가 true 면 그 자리에서
  throw 한다 (`packages/react/src/orchestrator/mount.ts:156-159`).
- 판정은 `process.env.NODE_ENV === 'production'` 비교 (`mount.ts:464-471`). Vite 가
  build 시 이 토큰을 리터럴로 치환하므로 정상적인 dev/prod 분기에서는 의도대로
  작동한다.
- 동시에 Vite 플러그인은 `apply: 'serve'` 로 production build 자체에서는 플러그인
  코드가 동작하지 않도록 1 차 차단한다 (`packages/vite/src/plugin.ts:109`). 이 에러가
  뜬다는 건 layer 1 (빌드 시점) 을 우회해 직접 `mountAgentDevtools` 를 호출했다는
  뜻이다.

**해결**

1. 호스트 앱 코드가 `mountAgentDevtools` 를 직접 import 하고 있다면, 그 import 자체를
   `if (import.meta.env.DEV)` 또는 동등한 빌드 환경 게이트로 감싼다. Vite 플러그인
   경유로만 마운트하는 경우 (`@agent-devtools/vite` 의 `agentDevtools()`) 는 이
   에러를 만날 수 없다.
2. staging / preview 빌드에서 의도적으로 위젯을 살리고 싶다면
   `mountAgentDevtools({ force: true })` 를 명시한다 (`mount.ts:88-96`). 이 옵션은
   production 환경에 위젯이 노출되는 사고를 의도된 결정으로 바꾸는 안전장치이지,
   사고 시 우회 수단이 아니다.

## 위젯이 dev 서버에서 아예 보이지 않음

**증상**

- 호스트 앱은 정상으로 뜨지만 우하단의 launcher 버튼이 없다.
- DevTools 콘솔에 widget 관련 에러 없음.
- DevTools Elements 에서 host 페이지의 어떤 노드에도 `shadow-root` 가 없다.

**원인**

- Vite 플러그인의 `transformIndexHtml` 은 `enabled` 옵션이 false 이거나, 플러그인이
  `apply: 'serve'` 외 모드 (`vite build`) 에서 호출되면 동작하지 않는다
  (`packages/vite/src/plugin.ts:99-109`, `:141-163`).
- `spawnServer: false` 인 경우에도 bootstrap 자체는 주입되지만 transport 없이 mount
  되므로 launcher 는 보이고 메시지 전송 시 "not configured" 에러로 끝난다
  (`plugin.ts:291-308`) — 즉 launcher 마저 없다는 것은 head 의 bootstrap script 가
  주입되지 않았다는 뜻이다.

**해결**

1. dev 서버 출력 HTML (`view-source:` 로 열거나 DevTools → Sources → 최상위 HTML)
   에서 `<script type="module">` 안에 `mountAgentDevtools` 호출이 들어 있는지
   확인한다. 없다면 플러그인이 등록 자체가 안 된 상태다 — `vite.config.ts` 의
   `plugins: [agentDevtools()]` 누락 또는 `enabled: false` 를 점검한다.
2. `apply: 'serve'` 차단인지 확인하려면 `vite` 실행 명령이 정말로 `dev` 인지
   (build / preview 가 아닌지) 확인한다.
3. middlewareMode 로 띄운 커스텀 셋업에서는 `httpServer` 가 없어 agent 서버가
   프로세스 종료 시점까지 떠 있는다 (`plugin.ts:131-139`). 위젯이 보이지 않는다는
   증상과는 무관하지만, 잔여 프로세스가 다음 세션의 4317 점유로 이어질 수 있다.
