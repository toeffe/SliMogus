// Live connectivity proof — PeerJS 5-char room codes (no SDP blob paste).
// Drives 3 real browser contexts: host + joinerA + joinerB, full mesh, identical hashes.
import { chromium } from 'playwright';

const BASE_URL = process.env.SLIMOGUS_URL ?? 'http://localhost:5173/';
const TIMEOUT = 30000;

function log(label, message) {
  console.log(`[${label}] ${message}`);
}

async function waitForPlayerCount(page, count, label) {
  try {
    await page.waitForFunction(
      (n) => document.querySelectorAll('.lobby__player').length === n,
      count,
      { timeout: TIMEOUT },
    );
  } catch (error) {
    const actual = await page
      .evaluate(() => document.querySelectorAll('.lobby__player').length)
      .catch(() => 'N/A');
    const meshInfo = await page
      .evaluate(() => window.__slimogusMesh?.connectedPlayerIds ?? 'no mesh')
      .catch(() => 'N/A');
    log(
      label,
      `waitForPlayerCount(${count}) timed out; actual=${actual} connectedPlayerIds=${JSON.stringify(meshInfo)}`,
    );
    throw error;
  }
}

async function joinWithCode(joinerPage, joinerLabel, roomCode) {
  await joinerPage.click('[data-tab="join"]');
  await joinerPage.fill('[data-field="room-code"]', roomCode);
  await joinerPage.click('[data-action="join-room"]');
  try {
    await joinerPage.waitForSelector('.lobby', { timeout: TIMEOUT });
  } catch (error) {
    const errorText = await joinerPage.textContent('[data-field="error"]').catch(() => null);
    log(joinerLabel, `failed to reach lobby; wizard error: ${errorText}`);
    throw error;
  }
}

async function main() {
  const browser = await chromium.launch();
  const [hostPage, joinerAPage, joinerBPage] = await Promise.all(
    ['host', 'joinerA', 'joinerB'].map(async (label) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on('pageerror', (error) => console.error(`[${label}] page error:`, error));
      page.on('console', (msg) => console.log(`[${label}] console:`, msg.text()));
      await page.goto(BASE_URL);
      return page;
    }),
  );

  log('host', 'creating room');
  await hostPage.click('[data-tab="host"]');
  await hostPage.waitForSelector('.lobby', { timeout: TIMEOUT });
  const roomCode = (await hostPage.textContent('[data-field="room-code"]'))?.trim() ?? '';
  if (roomCode.length !== 5) {
    throw new Error(`Expected 5-char room code, got "${roomCode}"`);
  }
  log('host', `room code ${roomCode}`);

  log('host', 'inviting joinerA via code');
  await joinWithCode(joinerAPage, 'joinerA', roomCode);
  await Promise.all([
    waitForPlayerCount(hostPage, 2, 'host'),
    waitForPlayerCount(joinerAPage, 2, 'joinerA'),
  ]);
  log('host', 'joinerA connected (2 players in lobby on both sides)');

  log('host', 'inviting joinerB via code');
  await joinWithCode(joinerBPage, 'joinerB', roomCode);
  await Promise.all([
    waitForPlayerCount(hostPage, 3, 'host'),
    waitForPlayerCount(joinerAPage, 3, 'joinerA'),
    waitForPlayerCount(joinerBPage, 3, 'joinerB'),
  ]);
  log('host', 'joinerB connected — all 3 peers show 3 players in the lobby');

  await Promise.all(
    [joinerAPage, joinerBPage].map((page) =>
      page.waitForFunction(() => (window.__slimogusMesh?.connectedPlayerIds.length ?? 0) === 2, {
        timeout: TIMEOUT,
      }),
    ),
  );
  log(
    'mesh',
    'confirmed: joinerA and joinerB are each directly connected to both other peers (full mesh)',
  );

  for (const page of [hostPage, joinerAPage, joinerBPage]) {
    await page.click('[data-action="toggle-ready"]');
  }
  await hostPage.waitForFunction(
    () => document.querySelector('[data-action="start"]')?.disabled === false,
    { timeout: TIMEOUT },
  );
  log('host', 'all players ready, starting the game');
  await hostPage.click('[data-action="start"]');

  await Promise.all(
    [hostPage, joinerAPage, joinerBPage].map((page) =>
      page.waitForSelector('canvas', { timeout: TIMEOUT }),
    ),
  );
  log('game', 'all 3 peers reached the game screen');

  const pages = [hostPage, joinerAPage, joinerBPage];
  await Promise.all(
    pages.map((page) =>
      page.waitForFunction(() => typeof window.__slimogusGetHashAtTick === 'function', {
        timeout: TIMEOUT,
      }),
    ),
  );

  for (const page of pages) {
    await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.click(10, 10).catch(() => {});
  }

  // Short sync sample — hashes at a shared past tick must match.
  await hostPage.waitForTimeout(2500);
  const ticks = await Promise.all(
    pages.map((page) => page.evaluate(() => window.__slimogusGetCurrentTick())),
  );
  const sharedTick = Math.max(0, Math.min(...ticks) - 10);
  const hashes = await Promise.all(
    pages.map((page) => page.evaluate((t) => window.__slimogusGetHashAtTick(t), sharedTick)),
  );
  log('game', `hashes @ tick ${sharedTick}: ${hashes.join(' | ')}`);
  if (hashes.some((h) => !h) || new Set(hashes).size !== 1) {
    throw new Error(`Hash mismatch at tick ${sharedTick}: ${hashes.join(' | ')}`);
  }

  log('game', 'PeerJS code-join kept all 3 peers in sync over real WebRTC');
  console.log('\nLIVE CONNECTIVITY CHECK PASSED');
  await browser.close();
}

main().catch((error) => {
  console.error('\nLIVE CONNECTIVITY CHECK FAILED');
  console.error(error);
  process.exit(1);
});
