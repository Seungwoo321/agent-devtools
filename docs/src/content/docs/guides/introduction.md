---
title: 소개
description: agent-devtools 는 페이지 안에서 바로 동작하는 in-page 에이전트 데브툴이다. 본인의 Claude 구독을 그대로 사용해 코드까지 직접 수정한다.
---

## agent-devtools 는 무엇인가

agent-devtools 는 **개발 중인 웹 앱 안에 떠 있는 플로팅 위젯**이다. 채팅창에
자연어 프롬프트를 적으면, 로컬에서 돌고 있는 **Claude Code 가 해당 소스 파일을
직접 편집**한다.

브라우저 탭을 떠나지 않고, IDE 로 컨텍스트 스위칭하지 않고, 화면에서 보이는
컴포넌트를 그대로 가리키며 "이 카드의 padding 8 더 늘려줘" 같은 식으로 일할 수
있게 만드는 도구다.

## 왜 만들었나

기존 AI 코딩 보조 도구들은 두 가지 중 하나였다.

- **IDE 안에서** 동작 — 코드 컨텍스트는 강하지만, 실제 렌더링된 UI 상태 (이
  드롭다운이 열려 있는 상태, 이 form 이 에러를 보여주는 상태) 를 모른다.
- **브라우저 안에서** 동작 — UI 컨텍스트는 강하지만, 결과는 "이렇게 고치면
  된다" 같은 가이드 텍스트로 돌아온다. 실제 파일 수정은 사람이 한다.

agent-devtools 는 두 세계를 합친다.

- 위젯이 **브라우저 안**에 있어서 사용자가 보는 그대로 UI 컨텍스트가 잡힌다
  (React fiber, source location).
- 위젯 뒤에는 **로컬 Claude Code 가 stdio JSON-RPC (ACP) 로 연결**되어 있어서
  실제 파일을 수정한다. Pull Request 도 만든다.

## 누구를 위한 도구인가

- **본인의 Claude Pro / Max 구독을 이미 쓰고 있는 개발자.**
  agent-devtools 는 새 API 결제를 요구하지 않는다. 로컬 Claude Code CLI 의
  `~/.claude` OAuth 세션을 그대로 재사용한다.
- **React / Vue / Next / Nuxt 로 개발 중인 프로덕트 팀.**
  공식 어댑터는 React + Vite, Vue 3 + Vite, Next.js 15 (App Router + Pages
  Router), Nuxt 3 — 네 가지로 제공된다. 각 어댑터는 실제 빌드 산출물을
  대상으로 한 CI 자동 production-leak 가드를 갖는다.
- **로컬 개발 환경에서만 켜는 도구가 필요한 사람.**
  agent-devtools 는 프로덕션 빌드에 포함되지 않는다. `import.meta.env.DEV` 등으로
  개발 모드에서만 마운트하도록 설계되어 있다.

## 무엇이 아닌가

이 도구는 다음과 같은 도구가 **아니다**.

- **프로덕션 운영 도구가 아니다.** 위젯은 로컬 개발 서버에서만 동작한다.
  배포 환경에 노출되지 않는다.
- **클라우드 SaaS 가 아니다.** 모든 처리는 본인 노트북에서 일어난다. 코드는
  네트워크를 떠나지 않는다 (Anthropic 으로 가는 LLM 요청 제외).
- **자율 에이전트가 아니다.** 사용자가 프롬프트를 보낼 때만 동작한다.
  Permission mode 가 `default` 면 모든 파일 변경 / 명령 실행에 대해 명시적
  승인을 요구한다.
- **새 결제 모델이 아니다.** 본인 Claude 구독을 그대로 쓴다. 별도 결제가 끼지
  않는다.

## 다음으로 읽을 것

- [설치](/guides/installation/) — Vite + React 프로젝트에 5분 안에 붙이기
- [첫 실행](/guides/first-run/) — 위젯을 띄우고 첫 프롬프트 보내기
- [Provider 가이드](/guides/providers/) — ACP 와 SDK 중 무엇을 쓸지
- [권한 모드](/guides/permission-modes/) — 파일 수정 권한 설정
