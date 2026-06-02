/**
 * capture-still.mjs — capture the raw widget screenshots used to compose the
 * Product Hunt gallery stills (see scripts/make-posters.mjs).
 *
 * Produces, under OUT_DIR (default ./demo-capture):
 *   - still-composer.png : a tight, high-DPI shot of the composer chip with
 *     its expanded tooltip (source file + component chain + selector) — the
 *     real PickedEvidence the picker hands the agent, not a mockup.
 *   - still-context.png  : the same moment framed in the page (the broken red
 *     Checkout total beside the widget) for an in-context backdrop.
 *
 * Prerequisites mirror capture-demo.mjs: the example dev server running with
 * AGENT_DEVTOOLS_OPEN_SHADOW=1 at BASE_URL, and the Checkout bug injected so
 * the backdrop total reads red.
 */
/* eslint-disable no-console -- CLI capture status output goes to stdout/stderr by design */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5190';
const OUT_DIR = resolve(HERE, '..', process.env.OUT_DIR ?? 'demo-capture');
const W = 1600;
const H = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const launcher = page.locator('button[data-agent-devtools-launcher]');
  const composer = page.locator('[data-agent-devtools-composer]');
  const pickBtn = composer.locator('[data-agent-devtools-composer-pick]');
  const chip = composer.locator('[data-agent-devtools-composer-chip] > span').first();
  const chipTip = composer.locator('[data-agent-devtools-composer-chip-tooltip]');
  const grandTotal = page.locator('[data-testid="grand-total"]');

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    // Frame the card to the left so the widget and the totals both breathe.
    await page.addStyleTag({
      content: `main { margin: 0 !important; padding: 56px 0 56px 64px !important; max-width: 860px !important; }`,
    });
    await launcher.waitFor({ state: 'visible', timeout: 30_000 });

    await launcher.click();
    await composer.waitFor({ state: 'visible', timeout: 10_000 });
    await pickBtn.click();
    await sleep(300);
    await grandTotal.click();
    await composer.waitFor({ state: 'visible', timeout: 10_000 });
    await sleep(300);

    // Force the evidence tooltip open and keep it open for the shot.
    await chip.dispatchEvent('pointerenter');
    await chip.dispatchEvent('focus');
    await chipTip
      .evaluate((el) => {
        el.style.opacity = '1';
        el.style.visibility = 'visible';
      })
      .catch(() => {});
    await sleep(400);

    await page.screenshot({ path: resolve(OUT_DIR, 'still-context.png') });
    await composer.screenshot({ path: resolve(OUT_DIR, 'still-composer.png') });
    console.log('stills written under', OUT_DIR);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
