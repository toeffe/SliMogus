// One-off Phase 3 visual proof — not part of the regular test suite. Hosts a
// solo room, starts the game, lets it run for a moment, and screenshots the
// result so camera/tilemap/player-visual changes can be eyeballed without a
// human opening a browser.
import { chromium } from 'playwright';

const BASE_URL = process.env.SLIMOGUS_URL ?? 'http://localhost:5173/';
const OUT_PATH = process.env.SLIMOGUS_SCREENSHOT ?? 'scripts/.visual-check.png';
const TIMEOUT = 20000;

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error('page error:', error));
  page.on('console', (msg) => console.log('console:', msg.text()));

  await page.goto(BASE_URL);
  await page.click('[data-action="create-room"]');
  await page.waitForSelector('.lobby', { timeout: TIMEOUT });
  await page.click('[data-action="toggle-ready"]');
  await page.waitForFunction(
    () => document.querySelector('[data-action="start"]')?.disabled === false,
    { timeout: TIMEOUT },
  );
  await page.click('[data-action="start"]');
  await page.waitForSelector('canvas', { timeout: TIMEOUT });
  // First-run tutorial opens after the game mounts — dismiss so the 3D view is visible.
  const closeHelp = page.locator('.help-overlay:not([hidden]) [data-action="close"]');
  try {
    await closeHelp.waitFor({ state: 'visible', timeout: 5000 });
    await closeHelp.click();
    await page.locator('.help-overlay[hidden]').waitFor({ timeout: 3000 });
  } catch {
    // Tutorial already dismissed in this profile.
  }
  await page.waitForTimeout(2000);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(500);

  await page.screenshot({ path: OUT_PATH });
  console.log(`Screenshot saved to ${OUT_PATH}`);

  await browser.close();
}

main().catch((error) => {
  console.error('VISUAL CHECK FAILED');
  console.error(error);
  process.exit(1);
});
