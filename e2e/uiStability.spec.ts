/**
 * Stage 2 P5: shop and upgrade windows keep stable dimensions while the
 * player interacts — purchases, disabled-state changes, and rerolls must
 * not resize the panels.
 */

import { test, expect } from '@playwright/test';

const BENIGN_CONSOLE = [/WebGL/, /Audio/i, /preload/i, /Failed to load resource/];

test('shop panel and upgrade cards keep stable dimensions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !BENIGN_CONSOLE.some((re) => re.test(msg.text()))) {
      errors.push(msg.text());
    }
  });

  await page.goto('/');
  await page.locator('.screen:visible .title-xl').waitFor();
  await page.locator('.screen:visible').getByRole('button', { name: /Deploy/ }).click();
  await page.locator('.screen:visible').getByRole('button', { name: 'DEPLOY' }).click();
  // First-run field manual (fresh storage) → confirm.
  const manualBtn = page.locator('.screen:visible').getByRole('button', { name: /UNDERSTOOD/i });
  if (await manualBtn.isVisible({ timeout: 3000 }).catch(() => false)) await manualBtn.click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForTimeout(600);

  // Force a break + open the Armory with credits to spend.
  await page.evaluate(() => {
    const g = (window as any).HORDEFALL;
    g.devKillAll();
    g.sim.credits = 5000;
    g.sim.player.health = 40; // health purchase is enabled
  });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyB');
  const panel = page.locator('.screen:visible .panel.shop-panel');
  await expect(panel).toBeVisible();

  const before = (await panel.boundingBox())!;
  // Buy several things, including ones that flip buttons into disabled states.
  await page.locator('.screen:visible').getByRole('button', { name: /\+50 health/ }).click();
  await page.locator('.screen:visible').getByRole('button', { name: /\+50 armor/ }).click();
  await page.locator('.screen:visible').getByRole('button', { name: /Unlock/ }).first().click();
  await page.waitForTimeout(150);
  const after = (await panel.boundingBox())!;
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(2);

  // Upgrade cards: identical fixed boxes regardless of content.
  await page.keyboard.press('Escape'); // close shop → resume
  await page.evaluate(() => {
    const g = (window as any).HORDEFALL;
    g.sim.progression.pendingLevelUps = 1;
  });
  const cards = page.locator('.upgrade-card');
  await expect(cards.first()).toBeVisible({ timeout: 5000 });
  const boxes = await cards.evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }));
  expect(boxes.length).toBeGreaterThanOrEqual(2);
  for (const b of boxes) {
    expect(b.w).toBe(boxes[0].w);
    expect(b.h).toBe(boxes[0].h);
  }

  expect(errors).toEqual([]);
});
