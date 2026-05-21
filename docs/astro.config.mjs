// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// agent-devtools 사용자 가이드 사이트.
//
// i18n 정책:
//   - defaultLocale = 'ko' (root path '/' 는 한국어)
//   - 'en' 은 '/en/...' 으로 서빙
//
// 테마:
//   - Starlight 의 light/dark 토글은 헤더에서 빌트인 제공된다 (별도 설정 불요)
//   - 시스템 prefers-color-scheme 자동 추종 + 수동 토글
//
// 사이드바:
//   - autogenerate 를 쓰지 않고 명시적으로 선언 — ko/en 페이지 키가 같아야
//     locale 전환 시 같은 항목이 매핑된다 (slug 만 다르고 label 은 번역됨).
export default defineConfig({
  site: 'https://agent-devtools.seungwoo321.dev',
  integrations: [
    starlight({
      title: 'agent-devtools',
      description: 'In-page agent devtools for React/Vue/Next/Nuxt — BYO Claude subscription.',
      logo: {
        src: './src/assets/logo.svg',
      },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/custom.css'],
      defaultLocale: 'root',
      locales: {
        root: {
          label: '한국어',
          lang: 'ko',
        },
        en: {
          label: 'English',
          lang: 'en',
        },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/Seungwoo321/agent-devtools',
        },
      ],
      sidebar: [
        {
          label: '시작하기',
          translations: { en: 'Getting started' },
          items: [
            {
              label: '소개',
              translations: { en: 'Introduction' },
              slug: 'guides/introduction',
            },
            {
              label: '설치',
              translations: { en: 'Installation' },
              slug: 'guides/installation',
            },
            {
              label: '첫 실행',
              translations: { en: 'First run' },
              slug: 'guides/first-run',
            },
          ],
        },
        {
          label: '핵심 개념',
          translations: { en: 'Core concepts' },
          items: [
            {
              label: 'Provider — ACP vs SDK',
              translations: { en: 'Provider — ACP vs SDK' },
              slug: 'guides/providers',
            },
            {
              label: '권한 모드',
              translations: { en: 'Permission modes' },
              slug: 'guides/permission-modes',
            },
            {
              label: '위젯과 페이지 컨텍스트',
              translations: { en: 'Widget & page context' },
              slug: 'guides/widget',
            },
          ],
        },
        {
          label: '운영',
          translations: { en: 'Operations' },
          items: [
            {
              label: '보안 모델 / Pairing Token',
              translations: { en: 'Security model & pairing token' },
              slug: 'guides/security',
            },
            {
              label: '구성 레퍼런스',
              translations: { en: 'Configuration reference' },
              slug: 'guides/configuration',
            },
            {
              label: '문제 해결',
              translations: { en: 'Troubleshooting' },
              slug: 'guides/troubleshooting',
            },
            {
              label: 'FAQ',
              translations: { en: 'FAQ' },
              slug: 'guides/faq',
            },
          ],
        },
      ],
    }),
  ],
});
