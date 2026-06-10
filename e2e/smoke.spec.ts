/**
 * Browser smoke test: boots the real app in Chromium, starts a run, checks
 * the HUD/renderer/menus, exercises a stress path, and fails on any page
 * error or serious console error. This is the runtime net the headless
 * vitest suite cannot provide.
 */

import { expect, test, type Page } from '@playwright/test';

/** Console noise that is not a game bug (offline font fetches etc.). */
const BENIGN_CONSOLE = /fonts\.googleapis|fonts\.gstatic|favicon|net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED)/;

function watchErrors(page: Page): { pageErrors: string[]; consoleErrors: string[] } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !BENIGN_CONSOLE.test(msg.text())) consoleErrors.push(msg.text());
  });
  return { pageErrors, consoleErrors };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const game = (page: Page) => page.evaluate(() => {
  const g = (window as any).HORDEFALL;
  return {
    hasSim: !!g.sim,
    wave: g.sim?.waves.wave ?? -1,
    waveState: g.sim?.waves.state ?? 'none',
    aliveEnemies: g.sim?.enemies.aliveCount ?? -1,
    drawCalls: g.renderer?.core.drawCalls ?? -1,
    triangles: g.renderer?.core.triangles ?? -1,
  };
});

test('boot → deploy → run → menus → stress, with zero page errors', async ({ page }) => {
  const errors = watchErrors(page);
  // Every screen stays mounted (display:none); scope queries to the visible one.
  const screen = page.locator('.screen:visible');

  // --- Load & main menu
  await page.goto('/');
  await expect(screen.locator('.title-xl')).toHaveText('HORDEFALL');
  await expect(page.locator('#game-canvas')).toBeAttached();
  await expect(screen.getByRole('button', { name: /Deploy/ })).toBeVisible();

  // --- Start a run; the very first deployment shows the controls briefing
  await screen.getByRole('button', { name: /Deploy/ }).click();
  await expect(screen.locator('.heading', { hasText: 'Field Manual' })).toBeVisible();
  await screen.getByRole('button', { name: 'DEPLOY' }).click();
  await expect(page.locator('#hud')).toBeVisible();

  // Run is actually live: sim exists and the renderer is drawing real geometry.
  await page.waitForTimeout(1200); // let a few frames render
  const running = await game(page);
  expect(running.hasSim).toBe(true);
  expect(running.drawCalls).toBeGreaterThan(0);
  expect(running.triangles).toBeGreaterThan(100);

  // --- Pause menu over the live run
  await page.keyboard.press('Escape');
  await expect(screen.locator('.heading', { hasText: 'Paused' })).toBeVisible();

  // --- Settings round-trip
  await screen.getByRole('button', { name: 'Settings' }).click();
  await expect(screen.locator('.heading', { hasText: 'Settings' })).toBeVisible();
  await screen.getByRole('button', { name: 'GRAPHICS' }).click();
  await expect(screen.getByText('Quality preset')).toBeVisible();
  await screen.getByRole('button', { name: 'Back' }).click();
  await expect(screen.locator('.heading', { hasText: 'Paused' })).toBeVisible();

  // --- Resume, then exercise the dev stress path
  await screen.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#hud')).toBeVisible();
  const stressed = await page.evaluate(() => {
    const g = (window as any).HORDEFALL;
    g.devStress(100);
    return g.sim.enemies.aliveCount as number;
  });
  expect(stressed).toBeGreaterThanOrEqual(100);

  // Let the stressed horde run a moment; the sim must keep ticking.
  await page.waitForTimeout(800);
  const after = await game(page);
  expect(after.hasSim).toBe(true);
  expect(after.drawCalls).toBeGreaterThan(0);

  // --- Tuning console renders inside the F8 developer menu
  await page.keyboard.press('F8');
  await expect(screen.locator('.heading', { hasText: 'Developer' })).toBeVisible();
  await screen.getByRole('button', { name: 'TUNING' }).click();
  await expect(screen.getByText(/WEAPONS — damage & tiers apply LIVE/)).toBeVisible();
  await expect(screen.getByText('Global drop chance')).toBeVisible();
  await expect(screen.getByRole('button', { name: 'Export preset JSON' })).toBeVisible();
  await page.keyboard.press('Escape'); // resume from debug menu

  // --- Quit to menu and back: teardown must not error or leak listeners
  await page.keyboard.press('Escape');
  await expect(screen.locator('.heading', { hasText: 'Paused' })).toBeVisible();
  await screen.getByRole('button', { name: 'Abandon Run' }).click();
  await expect(screen.getByRole('button', { name: /Deploy/ })).toBeVisible();
  // Second deployment: the one-time briefing must NOT reappear.
  await screen.getByRole('button', { name: /Deploy/ }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForTimeout(600);
  const secondRun = await game(page);
  expect(secondRun.hasSim).toBe(true);
  expect(secondRun.drawCalls).toBeGreaterThan(0);

  // --- The whole journey must be error-free
  expect(errors.pageErrors, errors.pageErrors.join('\n')).toHaveLength(0);
  expect(errors.consoleErrors, errors.consoleErrors.join('\n')).toHaveLength(0);
});
