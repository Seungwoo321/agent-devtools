# Brand assets

agent-devtools 정체성 = **Inspect Bracket** (devtools picker 프레임 + 진행 화살표).

| 파일            | 용도                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `logo.svg`      | 256×256 컬러 마크 (#4f46e5). README / 외부 인용 / og 등 단일 색이 필요한 곳.                               |
| `logo-mono.svg` | 동일 마크이나 `currentColor` 기반 — 상위 테마 색을 상속. Starlight `logo` slot, dark/light 자동 적응 위치. |
| `favicon.svg`   | 32×32 둥근 사각 indigo 배경 + 흰색 마크. 브라우저 탭.                                                      |

색 토큰: `#4f46e5` (indigo-600). 다크 모드 위에서는 currentColor 변형(`logo-mono.svg`) 사용.
