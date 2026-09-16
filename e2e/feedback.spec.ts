import { expect, test } from '@playwright/test';

test('studio feedback shares only opted-in context and retains a draft after Escape', async ({ page }) => {
  await page.goto('/studio');
  const trigger = page.getByRole('button', { name: 'Feedback', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Help improve TopoStack' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Continue on GitHub' })).toBeDisabled();
  await dialog.getByLabel('Feedback type').selectOption('terrain');
  await dialog.getByLabel('Summary', { exact: true }).fill('Ridge is coarse & missing detail');
  await dialog.getByLabel('Details', { exact: true }).fill('The ridge looks stepped. I expected a smoother elevation source.');
  const link = dialog.getByRole('link', { name: 'Continue on GitHub' });
  let url = new URL((await link.getAttribute('href'))!);
  expect(url.searchParams.get('title')).toBe('[Terrain data] Ridge is coarse & missing detail');
  expect(url.searchParams.get('body')).not.toContain('selectedLocation');
  await dialog.getByRole('checkbox').check();
  await dialog.getByText('Review report and shared context', { exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Report preview' })).toHaveValue(/selectedLocation/);
  const handoff = dialog.locator('a.primary');
  url = new URL((await handoff.getAttribute('href'))!);
  // Larger fixtures use the explicit copy/paste handoff; smaller ones fit in the URL.
  if (url.searchParams.has('body')) expect(url.searchParams.get('body')).toContain('selectedLocation');
  else await expect(dialog.getByText('This report is too long', { exact: false })).toBeVisible();
  await expect(handoff).toHaveAttribute('target', '_blank');
  await dialog.getByRole('checkbox').uncheck();
  url = new URL((await link.getAttribute('href'))!);
  expect(url.searchParams.get('body')).not.toContain('selectedLocation');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.getByLabel('Summary', { exact: true })).toHaveValue('Ridge is coarse & missing detail');
});

test('mobile feedback handles long reports and clipboard denial without losing text', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Feedback', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Help improve TopoStack' });
  await dialog.getByLabel('Feedback type').selectOption('lake');
  await dialog.getByLabel('Summary', { exact: true }).fill('Missing lake survey');
  const details = '湖'.repeat(3000);
  await dialog.getByLabel('Details', { exact: true }).fill(details);
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  const link = dialog.getByRole('link', { name: 'Open GitHub to paste report' });
  expect(new URL((await link.getAttribute('href'))!).searchParams.has('body')).toBe(false);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }));
  await dialog.getByRole('button', { name: 'Copy report' }).click();
  await expect(dialog.getByText('Copy is unavailable.', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Report preview' })).toHaveValue(new RegExp(details));
  const size = await dialog.boundingBox();
  expect(size!.x).toBeGreaterThanOrEqual(0);
  expect(size!.width).toBeLessThanOrEqual(375);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Close feedback' }).click();
  await expect(dialog).not.toBeVisible();
});

test('lake data reporting opens the right category', async ({ page }) => {
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await page.getByRole('button', { name: 'Report lake data quality', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Feedback type')).toHaveValue('lake');
});
