/**
 * make-posters.mjs — render the two static Product Hunt gallery stills.
 *
 * Output (under OUT_DIR, default ./demo-capture):
 *   - poster-evidence.png : "the picker hands the agent your component" — frames
 *     the real composer screenshot (scripts/capture-still.mjs) beside callouts
 *     for the PickedEvidence fields (component chain, source file, selector).
 *   - poster-category.png : "where agent-devtools sits" — the category
 *     positioning table as a clean dark graphic with the product column lit.
 *
 * Both are brand-consistent dark posters at a 16:9 gallery ratio, rendered at
 * 2x for crispness. Run capture-still.mjs first so still-composer.png exists.
 */
/* eslint-disable no-console -- CLI render status output goes to stdout/stderr by design */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', process.env.OUT_DIR ?? 'demo-capture');
const W = 1600;
const H = 900;

const composerPath = resolve(OUT_DIR, 'still-composer.png');
if (!existsSync(composerPath)) {
  console.error(`Missing ${composerPath}. Run scripts/capture-still.mjs first.`);
  process.exit(1);
}
const composerB64 = readFileSync(composerPath).toString('base64');

const LOGO = `
<svg viewBox="0 0 256 256" width="40" height="40" aria-hidden="true">
  <g fill="none" stroke="#c7d2fe" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
    <path d="M44 88 V44 H88"/><path d="M168 44 H212 V88"/>
    <path d="M212 168 V212 H168"/><path d="M88 212 H44 V168"/>
  </g>
  <path d="M104 92 L160 128 L104 164" fill="none" stroke="#818cf8" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root { font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  body { width: ${W}px; height: ${H}px; background:
    radial-gradient(1200px 700px at 78% -10%, #1b2030 0%, #0f1117 55%); color: #e6e8eb;
    overflow: hidden; -webkit-font-smoothing: antialiased; }
  .wrap { width: 100%; height: 100%; padding: 56px 64px; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand .name { font-size: 22px; font-weight: 700; letter-spacing: -.2px; }
  .brand .name b { color: #a5b4fc; font-weight: 700; }
  .kicker { color: #818cf8; font-weight: 700; font-size: 15px; letter-spacing: .12em; text-transform: uppercase; }
  h1 { font-size: 46px; line-height: 1.08; letter-spacing: -1px; font-weight: 800; }
  h1 .accent { color: #a5b4fc; }
  .sub { color: #9aa1ab; font-size: 20px; line-height: 1.5; }
  .foot { margin-top: auto; color: #6b7280; font-size: 15px; }
  .pill { color:#cbd5e1; background:#181b22; border:1px solid #2a2f3b; border-radius:999px; padding:5px 12px; font-size:14px; font-weight:600; }
`;

function evidenceHTML() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    .row { flex: 1; display: grid; grid-template-columns: 1.05fr .95fr; gap: 48px; align-items: center; margin-top: 30px; }
    .left { display: flex; flex-direction: column; gap: 22px; }
    .ev { display: flex; gap: 14px; align-items: flex-start; }
    .ev .dot { width: 12px; height: 12px; border-radius: 50%; margin-top: 7px; flex: 0 0 auto;
      box-shadow: 0 0 0 4px rgba(99,102,241,.18); background: #818cf8; }
    .ev .lab { font-size: 15px; color: #9aa1ab; font-weight: 600; }
    .ev .val { font-size: 19px; color: #e6e8eb; font-weight: 600; }
    .ev .val code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #c7d2fe; font-size: 17px; }
    .shot { justify-self: center; border-radius: 18px; overflow: hidden;
      box-shadow: 0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06);
      background: #fff; }
    .shot img { display: block; width: 420px; height: auto; }
    .glow { position: relative; }
    .glow::before { content:''; position:absolute; inset:-40px; border-radius:40px;
      background: radial-gradient(closest-side, rgba(99,102,241,.28), transparent 70%); z-index:-1; }
  </style></head><body><div class="wrap">
    <div class="brand">${LOGO}<div class="name">agent<b>-</b>devtools</div></div>
    <div class="row">
      <div class="left">
        <div class="kicker">Pick → reasons, not greps</div>
        <h1>It hands the agent your <span class="accent">component</span> —<br>not a screenshot.</h1>
        <div class="sub">Click any element. The evidence travels with the pick, so the agent starts reasoning across files instead of grepping.</div>
        <div class="ev"><div class="dot"></div><div><div class="lab">COMPONENT CHAIN</div><div class="val"><code>OrderSummary → App</code></div></div></div>
        <div class="ev"><div class="dot"></div><div><div class="lab">SOURCE FILE</div><div class="val"><code>checkout/OrderSummary.tsx</code></div></div></div>
        <div class="ev"><div class="dot"></div><div><div class="lab">UNIQUE SELECTOR + OUTERHTML</div><div class="val">the exact node, every time</div></div></div>
      </div>
      <div class="glow"><div class="shot"><img src="data:image/png;base64,${composerB64}"></div></div>
    </div>
    <div class="foot">PickedEvidence ships with every pick · no IDE · BYO Claude Pro / Max</div>
  </div></body></html>`;
}

function categoryHTML() {
  const cols = [
    'agent-devtools',
    'IDE forwarder\n(e.g. Stagewise)',
    'Browser devtools\n(e.g. React DevTools)',
    'Feedback widget\n(e.g. Pastel)',
  ];
  const rows = [
    [
      'Who edits the code',
      'The agent, in the tab',
      'A separate IDE agent',
      'Nobody — read-only',
      'Nobody — a backlog item',
    ],
    ['IDE required', 'No', 'Yes', 'No', 'No'],
    [
      'Context sent to the agent',
      'Component chain + source + selector + outerHTML',
      'URL + screenshot + element',
      '—',
      'Screenshot + URL',
    ],
    ['Subscription', 'BYO Claude Pro / Max', 'BYO model API key', 'None', 'Vendor subscription'],
    ['Production-bundle bytes', 'Zero — 2-layer dev-only guard', 'Varies', 'Zero', 'Embedded SDK'],
  ];
  const head = cols
    .map(
      (c, i) =>
        `<th class="${i === 0 ? 'me' : ''}">${c.replace('\n', '<span class="dim"><br>')}${c.includes('\n') ? '</span>' : ''}</th>`,
    )
    .join('');
  const body = rows
    .map(
      ([label, ...cells]) =>
        `<tr><td class="rl">${label}</td>${cells.map((c, i) => `<td class="${i === 0 ? 'me' : ''}">${c}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    h1 { margin-top: 26px; font-size: 40px; }
    .sub { margin-top: 10px; margin-bottom: 26px; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 16px; flex: 1; }
    th, td { text-align: left; padding: 13px 16px; vertical-align: top; line-height: 1.35; }
    thead th { font-size: 15px; color: #9aa1ab; font-weight: 700; border-bottom: 1px solid #2a2f3b; }
    thead th .dim { color:#6b7280; font-weight:600; font-size:12px; }
    tbody td { border-bottom: 1px solid #20242e; color: #cbd5e1; }
    .rl { color: #9aa1ab; font-weight: 600; width: 220px; }
    th.me, td.me { background: rgba(99,102,241,.12); color: #e6e8eb; }
    th.me { color: #c7d2fe; }
    td.me { font-weight: 600; }
    thead th.me { border-bottom: 1px solid #4f46e5; border-top-left-radius: 10px; border-top-right-radius: 10px; }
    tbody tr:last-child td.me { border-bottom: 1px solid #4f46e5; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px; }
    .me-col-cap { color:#a5b4fc; }
  </style></head><body><div class="wrap">
    <div class="brand">${LOGO}<div class="name">agent<b>-</b>devtools</div></div>
    <div class="kicker" style="margin-top:24px">Honest neighbors, different axes</div>
    <h1>Where <span class="accent">agent-devtools</span> sits in the category</h1>
    <div class="sub">The agent edits inside the page — no IDE involved, no extra subscription, zero production bytes.</div>
    <table><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table>
    <div class="foot">A factual placement next to the closest neighbors — the axes are just different.</div>
  </div></body></html>`;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  for (const [name, html] of [
    ['poster-evidence', evidenceHTML()],
    ['poster-category', categoryHTML()],
  ]) {
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForTimeout(150);
    await page.screenshot({ path: resolve(OUT_DIR, `${name}.png`) });
    console.log('rendered', `${name}.png`);
  }
  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
