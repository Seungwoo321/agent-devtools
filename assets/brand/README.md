# Brand assets

agent-devtools 정체성 = **Inspect Bracket** (devtools picker 프레임 + 진행 화살표).

| 파일                  | 용도                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `logo.svg`            | 256×256 컬러 마크 (#4f46e5). README / 외부 인용 / og 등 단일 색이 필요한 곳.                                                          |
| `logo-mono.svg`       | 동일 마크의 `currentColor` 버전. `<svg>` 인라인 삽입처럼 상위 텍스트 색을 상속받는 환경 전용.                                         |
| `logo-mono-light.svg` | 마크의 dark stroke (#0f172a) 버전. `<img>` 태그처럼 currentColor 가 작동하지 않는 환경에서 light 테마용 자산. Starlight `logo.light`. |
| `logo-mono-dark.svg`  | 마크의 light stroke (#f8fafc) 버전. 같은 환경의 dark 테마용 자산. Starlight `logo.dark`.                                              |
| `favicon.svg`         | 32×32 둥근 사각 indigo 배경 + 흰색 마크. 브라우저 탭.                                                                                 |

색 토큰: `#4f46e5` (indigo-600) — 컬러 마크. mono variant 는 light/dark 테마에 맞는 slate stroke (#0f172a / #f8fafc) 로 분기. currentColor 가 전달되는 인라인 SVG 환경은 `logo-mono.svg` 한 자산으로 충분.
