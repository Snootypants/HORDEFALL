/**
 * Reproduction: pressing the openShop key (B) during a between-wave break
 * must open the Armory shop screen. Drives the real app through window.HORDEFALL.
 */

import { expect, test, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
const waveState = (page: Page) =>
  page.evaluate(() => (window as any).HORDEFALL?.sim?.waves.state ?? 'none');

test('B opens the shop during a wave break', async ({ page }) => {
  const screen = page.locator('.screen:visible');

  await page.goto('/');
  await screen.getByRole('button', { name: /Deploy/ }).click();
  // First deployment shows the controls briefing.
  await screen.getByRole('button', { name: 'DEPLOY' }).click();
  await expect(page.locator('#hud')).toBeVisible();

  // Force a clean break window so the test isn't racing the 4s ramp-in.
  await page.evaluate(() => {
    const g = (window as any).HORDEFALL;
    g.sim.waves.state = 'break';
    g.sim.waves.breakLeft = 60;
  });
  expect(await waveState(page)).toBe('break');

  // Press B — the openShop bind.
  await page.keyboard.press('b');

  // Expect the Armory shop screen.
  await expect(screen.locator('.heading', { hasText: 'Armory' })).toBeVisible({ timeout: 3000 });
});
