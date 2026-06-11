/**
 * Stage 2: the browser replay viewer loads an exported replay and the
 * transport controls actually drive it — play advances ticks, pause holds,
 * step adds exactly one tick, fast-forward finishes the replay, and the
 * final validation verdict appears. Replays never write to the profile.
 */

import { test, expect } from '@playwright/test';

test('record → export → view: transport controls drive a verified replay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await page.locator('.screen:visible .title-xl').waitFor();

  // Record a short real run, export it, and capture the profile snapshot.
  await page.locator('.screen:visible').getByRole('button', { name: /Deploy/ }).click();
  await page.locator('.screen:visible').getByRole('button', { name: 'DEPLOY' }).click();
  const manualBtn = page.locator('.screen:visible').getByRole('button', { name: /UNDERSTOOD/i });
  if (await manualBtn.isVisible({ timeout: 3000 }).catch(() => false)) await manualBtn.click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForTimeout(5000); // ~300 recorded ticks of real gameplay

  const replayJson = await page.evaluate(() => (window as any).HORDEFALL.exportReplay() as string);
  expect(replayJson).toBeTruthy();
  await page.keyboard.press('Escape'); // pause
  await page.locator('.screen:visible').getByRole('button', { name: /Abandon run/i }).click();
  const saveBefore = await page.evaluate(() => localStorage.getItem('horde.save') ?? '');

  // Open the viewer and load the replay.
  await page.locator('.screen:visible').getByRole('button', { name: 'Replay Viewer' }).click();
  await page.locator('.screen:visible textarea').fill(replayJson);
  await page.locator('.screen:visible').getByRole('button', { name: 'Start replay' }).click();
  const status = page.locator('#replay-status');
  await expect(status).toBeVisible();
  await expect(status).toContainText('tick 0/');

  const tick = async (): Promise<number> =>
    parseInt((await status.textContent())!.match(/tick (\d+)\//)![1], 10);

  // Play advances… (poll, then pause IMMEDIATELY so the replay can't finish)
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect.poll(tick, { timeout: 5000 }).toBeGreaterThan(10);
  await page.getByRole('button', { name: '⏸ Pause' }).click();
  await page.waitForTimeout(120);
  const paused = await tick();
  const total = parseInt((await status.textContent())!.match(/tick \d+\/(\d+)/)![1], 10);
  expect(paused).toBeLessThan(total - 2); // room left for the step assertion
  await page.waitForTimeout(400);
  expect(await tick()).toBe(paused); // …pause holds…

  // …step adds exactly one tick…
  await page.getByRole('button', { name: '⏭ Step' }).click();
  await expect(status).toContainText(`tick ${paused + 1}/`);

  // …free camera toggles without breaking the frame loop…
  await page.getByRole('button', { name: '🎥 Free camera' }).click();
  await page.waitForTimeout(200);

  // …fast-forward runs it to completion and validation verdicts appear.
  await page.getByRole('button', { name: '⏩ Fast-forward' }).click();
  await expect(status).toContainText('verified', { timeout: 20_000 });
  await expect(status).toContainText('✓');

  // Read-only: viewing changed nothing in the profile save.
  const saveAfter = await page.evaluate(() => localStorage.getItem('horde.save') ?? '');
  expect(saveAfter).toBe(saveBefore);

  await page.getByRole('button', { name: 'Exit replay' }).click();
  await expect(page.locator('.screen:visible .title-xl')).toHaveText('HORDEFALL');

  expect(errors).toEqual([]);
});
