/**
 * capture-demo.mjs — record the marketing demo of the agent-devtools widget.
 *
 * Drives the react-vite example through the full hero flow in one take:
 *   broken Checkout total -> open launcher -> activate picker -> pick the
 *   GRAND TOTAL cell -> reveal the picked evidence (source + component chain)
 *   -> type a question -> a REAL Claude agent reads across cart.ts / money.ts,
 *   removes a stray `* 100`, and Vite HMR collapses the inflated red total to
 *   the correct green one — all inside the same browser tab.
 *
 * Why this script exists:
 *   The demo GIF must be reproducible. Per the png2gif "decisions in the
 *   script, judgement in the human" split, everything deterministic (cursor
 *   path, typing, beat timing, captions, video size) lives here; the encode
 *   to GIF lives in a separate ffmpeg step the operator runs on the .webm.
 *
 * Capture-only cosmetics (NOT example source changes):
 *   - The example `<main>` is nudged left so the floating composer never
 *     covers the totals — pure camera framing, injected at runtime.
 *   - A synthetic cursor + click ripple (headless video has no OS pointer).
 *   - A caption banner that narrates each beat for a silent, looping GIF.
 *
 * Prerequisites:
 *   - examples/react-vite dev server running with the widget shadow root
 *     OPENED for capture (AGENT_DEVTOOLS_OPEN_SHADOW=1) at BASE_URL.
 *   - The Checkout bug injected in cart.ts: computeOrderTotals must read
 *     `applyTaxCents(subtotalCents, TAX_RATE) * 100`.
 *   - Local Claude Pro/Max CLI auth (both ACP and SDK delegate to it).
 *
 * Output: a .webm under OUT_DIR (default ./demo-capture). Feed the newest
 * .webm to ffmpeg to produce assets/demo.gif.
 */
/* eslint-disable no-console -- CLI capture status output goes to stdout/stderr by design */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5190';
const OUT_DIR = resolve(HERE, '..', process.env.OUT_DIR ?? 'demo-capture');
const W = 1440;
const H = 820;
const QUESTION =
  'This grand total is way off — it should be about $1,400, not $11,691. ' +
  'The line items and subtotal look fine. Trace where the number goes wrong ' +
  'across the files and fix it.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Capture-only framing + synthetic cursor + caption banner. */
async function injectChrome(page) {
  await page.addStyleTag({
    content: `
      main { margin: 0 !important; padding: 40px 0 40px 52px !important; max-width: 820px !important; }
      #__demo_cursor, #__demo_ring, #__demo_caption { will-change: transform, opacity; }
    `,
  });
  await page.evaluate(() => {
    const cursor = document.createElement('div');
    cursor.id = '__demo_cursor';
    cursor.style.cssText = [
      'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647',
      'pointer-events:none;transform:translate(-100px,-100px)',
      'transition:transform 600ms cubic-bezier(.22,.61,.36,1)',
      "background:url('data:image/svg+xml;utf8," +
        encodeURIComponent(
          "<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'><path d='M2 2 L2 17 L6 13 L9 20 L12 19 L9 12 L15 12 Z' fill='white' stroke='black' stroke-width='1.3' stroke-linejoin='round'/></svg>",
        ) +
        "') no-repeat center/contain",
      'filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))',
    ].join(';');
    document.body.appendChild(cursor);

    const ring = document.createElement('div');
    ring.id = '__demo_ring';
    ring.style.cssText = [
      'position:fixed;left:0;top:0;width:40px;height:40px;margin:-20px 0 0 -20px',
      'z-index:2147483646;pointer-events:none;border-radius:50%',
      'background:rgba(79,124,255,.5);transform:translate(-100px,-100px) scale(0)',
      'transition:transform 280ms ease',
    ].join(';');
    document.body.appendChild(ring);

    const cap = document.createElement('div');
    cap.id = '__demo_caption';
    cap.style.cssText = [
      'position:fixed;left:52px;bottom:34px;z-index:2147483645;pointer-events:none',
      'max-width:820px;padding:10px 18px;border-radius:999px',
      'background:rgba(15,17,23,.86);border:1px solid rgba(255,255,255,.12)',
      'color:#fff;font:600 17px/1.3 ui-sans-serif,system-ui,-apple-system,sans-serif',
      'box-shadow:0 8px 24px rgba(0,0,0,.4);opacity:0;transform:translateY(8px)',
      'transition:opacity 260ms ease,transform 260ms ease;letter-spacing:.1px',
    ].join(';');
    document.body.appendChild(cap);
  });
}

async function caption(page, text) {
  await page.evaluate((t) => {
    const cap = document.getElementById('__demo_caption');
    if (!cap) return;
    if (!t) {
      cap.style.opacity = '0';
      cap.style.transform = 'translateY(8px)';
      return;
    }
    cap.textContent = t;
    cap.style.opacity = '1';
    cap.style.transform = 'translateY(0)';
  }, text);
}

async function glide(page, x, y, settle = 650) {
  await page.evaluate(
    ([x, y]) => {
      const c = document.getElementById('__demo_cursor');
      if (c) c.style.transform = `translate(${x}px, ${y}px)`;
    },
    [x, y],
  );
  await page.mouse.move(x, y, { steps: 24 });
  await sleep(settle);
}

async function ripple(page, x, y) {
  await page.evaluate(
    ([x, y]) => {
      const r = document.getElementById('__demo_ring');
      if (!r) return;
      r.style.transition = 'none';
      r.style.transform = `translate(${x}px, ${y}px) scale(0)`;
      void r.offsetWidth;
      r.style.transition = 'transform 280ms ease';
      r.style.transform = `translate(${x}px, ${y}px) scale(1)`;
    },
    [x, y],
  );
  await sleep(300);
}

async function centerOf(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element not visible for centerOf');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT_DIR, size: { width: W, height: H } },
  });
  const page = await context.newPage();

  // Selectors mirror packages/e2e/support/fixtures.ts (open-shadow pierce).
  const launcher = page.locator('button[data-agent-devtools-launcher]');
  const composer = page.locator('[data-agent-devtools-composer]');
  const pickBtn = composer.locator('[data-agent-devtools-composer-pick]');
  const textarea = composer.locator('textarea');
  const chip = composer.locator('[data-agent-devtools-composer-chip] > span').first();
  const chipTip = composer.locator('[data-agent-devtools-composer-chip-tooltip]');
  const grandTotal = page.locator('[data-testid="grand-total"]');
  const grandTotalRow = page.locator('.grand-total-row');

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await injectChrome(page);
    await launcher.waitFor({ state: 'visible', timeout: 30_000 });

    // Beat 1 — establish the broken total.
    await glide(page, 470, H / 2, 300);
    await caption(page, 'This checkout total is way off — $11,691?');
    await sleep(2000);

    // Beat 2 — open the in-page agent.
    await caption(page, 'Open the agent — right inside the page');
    const l = await centerOf(launcher);
    await glide(page, l.x, l.y);
    await ripple(page, l.x, l.y);
    await launcher.click();
    await composer.waitFor({ state: 'visible', timeout: 10_000 });
    await sleep(800);

    // Beat 3 — activate the picker.
    await caption(page, 'Aim the picker at the broken number');
    const p = await centerOf(pickBtn);
    await glide(page, p.x, p.y);
    await ripple(page, p.x, p.y);
    await pickBtn.click();
    await sleep(700);

    // Beat 4 — hover then pick the GRAND TOTAL cell.
    const g = await centerOf(grandTotal);
    await glide(page, g.x, g.y, 950);
    await sleep(500);
    await ripple(page, g.x, g.y);
    await grandTotal.click();
    await composer.waitFor({ state: 'visible', timeout: 10_000 });
    await sleep(700);

    // Beat 5 — reveal the picked evidence (source file + component chain).
    await caption(page, 'Picker ships the component + source line');
    const c = await centerOf(chip);
    await glide(page, c.x, c.y, 450);
    await chip.dispatchEvent('pointerenter');
    await chip.dispatchEvent('focus');
    // Belt-and-suspenders: force the tooltip visible for the capture in case
    // the synthetic pointer path doesn't latch the hover state.
    await chipTip
      .evaluate((el) => {
        el.style.opacity = '1';
        el.style.visibility = 'visible';
      })
      .catch(() => {});
    await sleep(2200);

    if (process.env.DRY === '1') {
      await page.screenshot({ path: resolve(OUT_DIR, 'dry-typed.png') });
      const tip = page.locator('[data-agent-devtools-composer-chip-tooltip]');
      console.log('DRY tooltip text:', (await tip.textContent().catch(() => '(none)')) ?? '(none)');
      console.log('DRY screenshot written; skipping agent submit');
      return;
    }

    await chip.dispatchEvent('pointerleave');
    await chipTip
      .evaluate((el) => {
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
      })
      .catch(() => {});

    // Beat 6 — ask in plain English and send.
    await caption(page, 'Ask in plain English — no IDE');
    const t = await centerOf(textarea);
    await glide(page, t.x, t.y, 400);
    await textarea.click();
    await textarea.type(QUESTION, { delay: 20 });
    await sleep(500);
    await textarea.press('Enter');

    // Beat 7 — the real agent reads across files and applies the edit.
    await caption(page, 'Agent reads cart.ts → money.ts across files');
    const start = Date.now();
    let fixed = false;
    let switched = false;
    while (Date.now() - start < 150_000) {
      const txt = (await grandTotal.textContent().catch(() => '')) ?? '';
      const cls = (await grandTotalRow.getAttribute('class').catch(() => '')) ?? '';
      if (!switched && Date.now() - start > 6000) {
        switched = true;
        await caption(page, 'Found it: tax already in cents, scaled ×100 twice');
      }
      if (txt.includes('1,402.92') || cls.includes('is-ok')) {
        fixed = true;
        break;
      }
      await sleep(400);
    }

    // Beat 8 — payoff: the corrected total snaps in live.
    await caption(page, 'Fixed live — total snaps to $1,402.92');
    await glide(page, g.x, g.y, 500);
    await sleep(2600);

    // Beat 9 — tagline hold.
    await caption(page, 'Pick. Ask. Fixed — right in the page.');
    await sleep(2400);

    if (!fixed) console.error('WARN: total never reached the corrected value within 150s');
    else console.log('OK: grand total collapsed to the corrected value');
  } finally {
    await page.waitForTimeout(300);
    await context.close();
    await browser.close();
  }

  console.log('video written under', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
