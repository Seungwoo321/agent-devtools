---
title: 첫 실행
description: 위젯을 띄우고 첫 프롬프트로 실제 코드를 수정해 보는 5분 워크스루.
---

[설치](/guides/installation/) 까지 끝났다는 전제로 진행한다.

## 1. dev 서버 띄우기

```bash
pnpm dev
```

콘솔에 다음 두 줄이 보이면 정상이다.

```
[agent-devtools] pairing token (memory-only, rotates per CLI start)
[agent-devtools] provider: acp (default) — connecting to local Claude Code
```

브라우저 우측 하단에 보라색 원형 위젯이 떠 있다.

## 2. 위젯 열기

원형 아이콘을 클릭하면 위쪽으로 **채팅 박스가 펼쳐진다**. 아이콘을 드래그하면
채팅 박스도 함께 따라간다 — 화면 어느 모서리에든 둘 수 있다.

채팅 박스 안에는 세 가지 요소가 있다.

- **입력 필드** — 프롬프트를 적는 곳
- **Pick 버튼** — 페이지 위 element 를 지정해 컨텍스트로 첨부
- **설정 (톱니바퀴)** — provider, permission mode 등 설정

## 3. 첫 프롬프트: 텍스트만 바꾸기

가장 간단한 시나리오로 시작한다. 화면 어딘가에 있는 "Hello" 문구를 "안녕하세요"
로 바꿔보자.

1. **Pick 버튼** 을 누르고 "Hello" 라고 적힌 element 를 클릭한다.
   - 위젯이 React fiber 메타데이터를 자동으로 추출한다:
     - `componentName: "HelloHeader"`
     - `sourceLocation: "src/components/HelloHeader.tsx:14"`
2. 입력 필드에 다음 프롬프트를 적는다:
   ```
   이 텍스트를 한국어 "안녕하세요" 로 바꿔줘.
   ```
3. 엔터.

위젯에 스트리밍 응답이 나타난다. Claude Code 가:

1. `HelloHeader.tsx:14` 를 읽는다.
2. 텍스트를 바꾸는 edit 을 제안한다.
3. **edit 이 자동으로 적용된다.** agent-devtools 의 기본 permission mode 는
   `acceptEdits` 이므로, 파일 수정에는 별도 승인 요청이 뜨지 않는다. bash 실행
   등 부수효과가 있는 작업만 승인을 묻는다.
4. HMR 이 페이지를 자동으로 새로고침하고, 화면의 "Hello" 가 "안녕하세요" 로
   바뀐다.

## 4. 두 번째 프롬프트: 스타일 바꾸기

이번엔 element 의 padding 을 바꿔본다.

1. Pick 으로 카드 element 선택.
2. 프롬프트:
   ```
   이 카드의 padding 을 8px → 16px 로 바꿔줘.
   ```
3. 엔터.

Tailwind 를 쓰는 프로젝트라면 className 에 있는 `p-2` 가 `p-4` 로 바뀔
것이고, CSS 모듈을 쓰는 프로젝트라면 해당 `.module.css` 가 수정될 것이다.
어느 패턴이든 Claude Code 가 코드를 읽고 판단한다.

## 5. 권한 모드 선택지

기본값 `acceptEdits` 가 첫 실행 경험을 매끄럽게 만든다 — 파일 수정은 자동
적용, bash 같은 부수효과 작업만 위젯에서 승인을 묻는다. 매번 모든 edit 을
직접 확인하고 싶다면, 위젯 설정에서 permission mode 를 다음 중 하나로 바꿀
수 있다.

- **`default`** — Claude Code 의 표준 대화형 모드. 모든 도구 호출 (edit 포함)
  마다 위젯에 승인 요청이 뜬다. 첫 시도에서 edit 의 내용을 한 번씩 확인하고
  싶을 때 유용.
- **`acceptEdits`** _(기본값)_ — 파일 수정은 자동 승인, bash 등 부수효과만
  승인 요청.
- **`plan`** — edit 을 실제로 적용하지 않고 plan 만 받아본다. 작업 범위를
  먼저 확인하고 싶을 때.
- **`bypassPermissions`** — 모든 작업 자동 승인. 의도적으로 위험한 모드이므로
  1인 개발 환경 외에는 쓰지 말 것. 설정 패널에서만 노출되고 채팅 컴포저에서는
  선택할 수 없다.

각 모드의 정확한 의미와 안전 가이드는 [권한 모드](/guides/permission-modes/)
참고.

## 6. 무엇이 안 되는가

처음 써보면 헷갈리는 경계:

- **위젯은 "현재 보고 있는 페이지" 에만 기본 컨텍스트를 갖는다.**
  Pick 으로 element 를 잡으면 그 element 의 component / source 가 첨부되지만,
  앱 전체 구조는 모른다. "프로젝트 전체에서 X 를 다 바꿔줘" 같은 광역 작업은
  명시적으로 그렇게 적어줘야 한다 (Claude Code 가 grep/glob 으로 찾는다).
- **Pick 은 React fiber 기반이다.** dev build 가 아니면 fiber 메타가 다르게
  뽑힌다. 반드시 `pnpm dev` 에서 사용.
- **승인 요청은 (떠야 할 때) 위젯에 표시된다, dev 서버 콘솔이 아니다.** 기본
  모드인 `acceptEdits` 에서는 bash 같은 부수효과 작업에서만 승인 요청이 뜬다.
  콘솔만 보고 있으면 멈춘 것처럼 보일 수 있으니 위젯을 확인할 것.

## 다음으로

- [Provider 가이드](/guides/providers/) — ACP / SDK 차이와 선택
- [위젯과 페이지 컨텍스트](/guides/widget/) — Pick 의 동작 원리, 다중 element
- [구성 레퍼런스](/guides/configuration/) — Vite 플러그인 옵션 전체
