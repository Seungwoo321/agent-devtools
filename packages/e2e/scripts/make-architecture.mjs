/**
 * make-architecture.mjs — render the "How it works" architecture diagram.
 *
 * Output (under OUT_DIR, default ../../docs/public):
 *   - how-it-works.png    : English single-diagram walk-through.
 *   - how-it-works-ko.png : Korean single-diagram walk-through.
 *
 * Replaces the ASCII-art block on the how-it-works docs page with a polished,
 * brand-consistent dark poster. Three stacked tiers — the in-page widget, the
 * loopback dev server, and your files on disk — connected by labeled flow
 * arrows. Rendered at 2x for crisp retina display.
 *
 * Sibling of make-posters.mjs; same Playwright HTML-to-PNG approach.
 */
/* eslint-disable no-console -- CLI render status output goes to stdout/stderr by design */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', process.env.OUT_DIR ?? '../../docs/public');
const W = 1120;

const LOGO = `
<svg viewBox="0 0 256 256" width="34" height="34" aria-hidden="true">
  <g fill="none" stroke="#c7d2fe" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
    <path d="M44 88 V44 H88"/><path d="M168 44 H212 V88"/>
    <path d="M212 168 V212 H168"/><path d="M88 212 H44 V168"/>
  </g>
  <path d="M104 92 L160 128 L104 164" fill="none" stroke="#818cf8" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// Inline glyphs (stroke = currentColor) so each tier carries a quiet icon.
const ICON = {
  browser: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><circle cx="6.2" cy="6.5" r=".6" fill="currentColor" stroke="none"/><circle cx="8.4" cy="6.5" r=".6" fill="currentColor" stroke="none"/></svg>`,
  server: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="1.6"/><rect x="3" y="13" width="18" height="7" rx="1.6"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10" width="15" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`,
};

const STR = {
  en: {
    kicker: 'How the loop closes',
    title: 'One loop across four parts you already run',
    tier1: { label: 'Browser tab', sub: 'the page you are developing' },
    host: {
      label: 'Host app DOM',
      tag: 'React · Vue · Next · Nuxt · Angular · Svelte · SvelteKit',
    },
    widget: {
      label: 'agent-devtools widget',
      points: [
        'Closed shadow root — no style or event bleed',
        'Picker overlay → <code>PickedEvidence</code>',
        'Chat composer + live message stream',
      ],
    },
    wire1: 'Authorization: Bearer &lt;pairing token&gt;',
    wire1sub: 'header only — never in a URL',
    loopback: '127.0.0.1 · loopback only',
    tier2: { label: 'Local dev server', sub: 'same machine, loopback only' },
    nodes: [
      {
        name: '@agent-devtools/core',
        points: [
          'HTTP router + SSE event stream',
          'constant-time token check',
          'workspace-relative path resolver',
        ],
      },
      {
        name: '@agent-devtools/harness-core',
        points: ['provider abstraction (ACP / SDK)', 'permission policy matrix (per action type)'],
      },
    ],
    sdk: { label: 'Claude Code Agent SDK', note: 'reuses ~/.claude OAuth session — no API key' },
    toolsLabel: 'tool calls',
    wire2: 'Edit / Write applied to the workspace',
    tier3: {
      label: 'Your project files on disk',
      sub: 'HMR picks the change up — same browser tab',
    },
    foot: 'No IDE · loopback only · zero production bytes · BYO Claude Pro / Max',
  },
  ko: {
    kicker: '루프가 닫히는 방식',
    title: '이미 켜둔 네 가지를 한 루프로',
    tier1: { label: '브라우저 탭', sub: '개발 중인 페이지' },
    host: {
      label: '호스트 앱 DOM',
      tag: 'React · Vue · Next · Nuxt · Angular · Svelte · SvelteKit',
    },
    widget: {
      label: 'agent-devtools 위젯',
      points: [
        'Closed shadow root — 스타일·이벤트 누수 없음',
        '픽커 overlay → <code>PickedEvidence</code>',
        '채팅 composer + 실시간 메시지 스트림',
      ],
    },
    wire1: 'Authorization: Bearer &lt;pairing token&gt;',
    wire1sub: '헤더 전용 — URL 에 절대 안 들어감',
    loopback: '127.0.0.1 · 루프백 전용',
    tier2: { label: '로컬 dev 서버', sub: '같은 머신, 루프백 전용' },
    nodes: [
      {
        name: '@agent-devtools/core',
        points: [
          'HTTP 라우터 + SSE 이벤트 스트림',
          'constant-time 토큰 검증',
          'workspace-relative 경로 resolver',
        ],
      },
      {
        name: '@agent-devtools/harness-core',
        points: ['provider 추상화 (ACP / SDK)', 'action 별 권한 정책 매트릭스'],
      },
    ],
    sdk: { label: 'Claude Code Agent SDK', note: '~/.claude OAuth 세션 재사용 — API 키 불필요' },
    toolsLabel: '툴 호출',
    wire2: 'Edit / Write 가 워크스페이스에 적용',
    tier3: { label: '디스크 위 프로젝트 파일', sub: 'HMR 이 변경을 반영 — 같은 브라우저 탭' },
    foot: 'IDE 불필요 · 루프백 전용 · 프로덕션 바이트 0 · BYO Claude Pro / Max',
  },
};

const TOOLS = ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'];

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root { font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; }
  body { width: ${W}px; background:
    radial-gradient(1100px 640px at 82% -8%, #1b2030 0%, #0e1016 58%);
    color: #e6e8eb; -webkit-font-smoothing: antialiased; }
  .page { padding: 52px 56px 44px; }
  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

  .head { display: flex; align-items: center; gap: 13px; margin-bottom: 26px; }
  .head .name { font-size: 21px; font-weight: 700; letter-spacing: -.2px; }
  .head .name b { color: #a5b4fc; }
  .head .sep { flex: 1; }
  .kicker { color: #818cf8; font-weight: 700; font-size: 12.5px; letter-spacing: .14em; text-transform: uppercase; }
  h1 { font-size: 27px; line-height: 1.18; letter-spacing: -.5px; font-weight: 800; margin: 4px 0 30px; }
  h1 .accent { color: #a5b4fc; }

  /* Tier shell */
  .tier { border: 1px solid #262b38; border-radius: 18px; background:
      linear-gradient(180deg, rgba(30,35,48,.62), rgba(20,23,32,.62));
    padding: 18px 20px 20px; position: relative; }
  .tier-head { display: flex; align-items: center; gap: 11px; margin-bottom: 14px; }
  .tier-ic { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center;
    color: #a5b4fc; background: rgba(99,102,241,.13); border: 1px solid rgba(129,140,248,.28); }
  .tier-ic svg { width: 19px; height: 19px; }
  .tier-t { font-size: 16.5px; font-weight: 700; letter-spacing: -.2px; }
  .tier-s { font-size: 13px; color: #8b93a1; margin-top: 1px; }

  /* Nested host + widget */
  .nest { border: 1px dashed #333a4a; border-radius: 14px; padding: 13px 14px; background: rgba(255,255,255,.012); }
  .nest-head { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin-bottom: 11px; }
  .nest-t { font-size: 14px; font-weight: 650; color: #d6dae1; }
  .tag { font-size: 11px; font-weight: 600; color: #9aa1ab; background: #181b22; border: 1px solid #2a2f3b;
    border-radius: 999px; padding: 3px 9px; }

  .widget { border: 1px solid rgba(129,140,248,.42); border-radius: 12px; padding: 13px 15px;
    background: linear-gradient(180deg, rgba(99,102,241,.14), rgba(79,70,229,.05));
    box-shadow: 0 0 0 1px rgba(99,102,241,.10), 0 14px 38px rgba(49,46,129,.30); }
  .widget-t { display: flex; align-items: center; gap: 8px; font-size: 14.5px; font-weight: 700; color: #c7d2fe; margin-bottom: 9px; }
  .widget-t .badge { font-size: 10px; font-weight: 700; letter-spacing: .04em; color: #0e1016;
    background: #a5b4fc; border-radius: 5px; padding: 2px 6px; text-transform: uppercase; }
  ul.pts { list-style: none; display: grid; gap: 6px; }
  ul.pts li { position: relative; padding-left: 18px; font-size: 13px; color: #cbd5e1; line-height: 1.45; }
  ul.pts li::before { content: ''; position: absolute; left: 2px; top: 7px; width: 6px; height: 6px;
    border-radius: 50%; background: #818cf8; box-shadow: 0 0 0 3px rgba(99,102,241,.16); }
  ul.pts li code { color: #c7d2fe; font-size: 12.5px; }

  /* Dev-server nodes */
  .nodes { display: grid; gap: 12px; }
  .node { border: 1px solid #2a3040; border-radius: 13px; padding: 13px 15px; background: rgba(255,255,255,.018); }
  .node-name { font-size: 14px; font-weight: 700; color: #e6e8eb; margin-bottom: 8px; }
  .node-name .mono { color: #c7d2fe; }
  .node.sdk { border-color: rgba(129,140,248,.34); background: rgba(99,102,241,.07); }
  .node .note { font-size: 12.5px; color: #9aa1ab; margin-bottom: 9px; }
  .tools { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .tools .tl { font-size: 11px; font-weight: 600; color: #8b93a1; margin-right: 2px; }
  .tools .chip { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 600;
    color: #c7d2fe; background: #14161d; border: 1px solid #2a2f3b; border-radius: 7px; padding: 3px 8px; }

  /* Flow connectors */
  .wire { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 13px 0; }
  .wire .pill { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600;
    color: #cbd5e1; background: #14161d; border: 1px solid #2a2f3b; border-radius: 999px; padding: 6px 14px; }
  .wire .pill svg { width: 15px; height: 15px; color: #a5b4fc; flex: 0 0 auto; }
  .wire .pill .lk { color: #a5b4fc; }
  .wire .pill code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #c7d2fe; }
  .wire .sub { font-size: 11.5px; color: #7e8696; }
  .wire .arrow { width: 2px; height: 16px; background: linear-gradient(#4f46e5, #818cf8);
    position: relative; border-radius: 2px; }
  .wire .arrow::after { content: ''; position: absolute; left: 50%; bottom: -4px; transform: translateX(-50%);
    border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 7px solid #818cf8; }

  .foot { margin-top: 26px; text-align: center; color: #6b7280; font-size: 12.5px; }
`;

function widgetPoints(points) {
  return points.map((p) => `<li>${p}</li>`).join('');
}

function nodeHTML(node) {
  return `<div class="node">
    <div class="node-name"><span class="mono">${node.name}</span></div>
    <ul class="pts">${widgetPoints(node.points)}</ul>
  </div>`;
}

function wire(showLock, label, sub) {
  const ic = showLock ? ICON.lock : '';
  const sd1 = label ? `<div class="pill">${ic}<span>${label}</span></div>` : '';
  const sd2 = sub ? `<div class="sub">${sub}</div>` : '';
  return `<div class="wire">${sd1}${sd2}<div class="arrow"></div></div>`;
}

function diagramHTML(lang) {
  const t = STR[lang];
  const toolChips =
    `<span class="tl">${t.toolsLabel}</span>` +
    TOOLS.map((x) => `<span class="chip">${x}</span>`).join('');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${CSS}</style></head>
  <body><div class="page">
    <div class="head">${LOGO}<div class="name">agent<b>-</b>devtools</div><div class="sep"></div>
      <div class="kicker">${t.kicker}</div></div>
    <h1>${t.title}</h1>

    <!-- Tier 1: browser -->
    <div class="tier">
      <div class="tier-head"><div class="tier-ic">${ICON.browser}</div>
        <div><div class="tier-t">${t.tier1.label}</div><div class="tier-s">${t.tier1.sub}</div></div></div>
      <div class="nest">
        <div class="nest-head"><span class="nest-t">${t.host.label}</span><span class="tag">${t.host.tag}</span></div>
        <div class="widget">
          <div class="widget-t">${t.widget.label}<span class="badge">closed shadow root</span></div>
          <ul class="pts">${widgetPoints(t.widget.points)}</ul>
        </div>
      </div>
    </div>

    ${wire(true, `<code>${t.wire1}</code>`, `${t.wire1sub} &nbsp;·&nbsp; ${t.loopback}`)}

    <!-- Tier 2: dev server -->
    <div class="tier">
      <div class="tier-head"><div class="tier-ic">${ICON.server}</div>
        <div><div class="tier-t">${t.tier2.label}</div><div class="tier-s">${t.tier2.sub}</div></div></div>
      <div class="nodes">
        ${t.nodes.map(nodeHTML).join('<div class="wire" style="padding:2px 0"><div class="arrow"></div></div>')}
        <div class="wire" style="padding:2px 0"><div class="arrow"></div></div>
        <div class="node sdk">
          <div class="node-name">${t.sdk.label}</div>
          <div class="note">${t.sdk.note}</div>
          <div class="tools">${toolChips}</div>
        </div>
      </div>
    </div>

    ${wire(false, `<code>${t.wire2}</code>`, '')}

    <!-- Tier 3: files -->
    <div class="tier" style="border-color:rgba(129,140,248,.30)">
      <div class="tier-head"><div class="tier-ic">${ICON.file}</div>
        <div><div class="tier-t">${t.tier3.label}</div><div class="tier-s">${t.tier3.sub}</div></div></div>
    </div>

    <div class="foot">${t.foot}</div>
  </div></body></html>`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: W, height: 1200 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  for (const [name, lang] of [
    ['how-it-works', 'en'],
    ['how-it-works-ko', 'ko'],
  ]) {
    await page.setContent(diagramHTML(lang), { waitUntil: 'networkidle' });
    await page.waitForTimeout(150);
    await page.screenshot({ path: resolve(OUT_DIR, `${name}.png`), fullPage: true });
    console.log('rendered', `${name}.png`);
  }
  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
