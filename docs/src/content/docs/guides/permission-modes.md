---
title: 권한 모드
description: agent-devtools 의 5가지 권한 모드 — default, acceptEdits, plan, bypassPermissions, dontAsk — 의 의미와 안전 가이드라인.
---

이 페이지는 작성 예정이다 (ADT-51).

권한 모드는 위젯 설정 패널에서 전환할 수 있으며, 기본값은 `acceptEdits` 이다.
`bypassPermissions` 는 설정 패널 안에서만 노출되고 채팅 컴포저에서는 선택할 수
없다.

## 5가지 모드

브라우저 위젯 사용자는 터미널 앞에 없기 때문에 ACP `session/request_permission`
프롬프트를 인터랙티브하게 띄울 수 없다. 따라서 각 요청은 활성 `permissionMode` 만으로
런타임에서 즉시 판정된다.

### default

모든 권한 요청을 거절한다. 위젯 트랜스포트에는 사용자에게 동의를 받을 UI 수단이
없기 때문에, 이 모드에서는 사실상 동의가 필요한 도구는 모두 막힌다.

### acceptEdits (기본값)

워크스페이스 경계 안에서 일어나는 일상적인 파일 편집을 자동 승인한다. 워크스페이스
경계는 `FileTools` 가 강제한다. Bash / web fetch 등 위험도가 높은 작업은 여전히
명시적 동의가 필요하다. 위젯이 별도 설정 없이 마운트되면 이 모드로 시작한다.

### plan

읽기 전용 계획(plan) 모드. 권한 요청은 모두 거절된다. 코드 변경 전에 모델이 계획을
수립하게 할 때 쓴다.

### bypassPermissions

모든 권한 요청을 무조건 허용한다. 한 세션의 모든 안전 프롬프트를 사실상 꺼버리는
효과가 있어, 채팅 컴포저에서는 선택할 수 없고 오직 설정 패널에서만 명시적으로 전환할
수 있다.

### dontAsk

`acceptEdits` 와 동일한 허용 경로를 탄다 — `allow_once` 옵션을 우선 골라 자동
승인한다. SDK 시맨틱으로는 "프롬프트를 띄우지 않고, 사전 승인된 것이 아니면 거절"
이지만, agent-devtools 의 위젯 환경에서는 워크스페이스 내 일상 편집이 암묵적
사전 승인 대상이라 결과적으로 `acceptEdits` 와 같은 동작이 된다. 어떠한 권한
프롬프트도 표면화하지 않도록 의도를 명시하고 싶을 때 사용한다.

구현 근거: `packages/core/src/providers/acp-runtime.ts:439` 의 `decidePermission`
— `bypassPermissions` / `acceptEdits` / `dontAsk` 세 모드만 허용 경로를 택하고,
`plan` / `default` 는 `outcome: cancelled` 로 거절한다.
