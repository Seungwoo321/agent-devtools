---
title: 보안 모델 / Pairing Token
description: agent-devtools 의 보안 경계 — pairing token, 로컬 전용 동작, 프로덕션 노출 방지.
---

이 페이지는 작성 예정이다 (ADT-53).

agent-devtools 는 로컬 개발 서버 전용 도구다. Pairing token 은 CLI 시작 시
메모리에만 생성되며 디스크에 저장하지 않는다. 위젯은 `import.meta.env.DEV`
가드 안에서만 마운트되어 프로덕션 빌드에 포함되지 않는다.
