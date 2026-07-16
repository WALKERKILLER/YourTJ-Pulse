import { expect, test } from '@playwright/test';

test('location sharing is off by default and uses an explicit privacy level', async ({ page }) => {
  await page.route('**/api/telemetry', (route) => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: '{"data":{"accepted":true}}',
  }));
  await page.goto('/settings/privacy');

  await expect(page.getByRole('heading', { name: '位置由你掌握' })).toBeVisible();
  const selector = page.getByLabel('默认共享级别');
  await expect(selector).toHaveValue('approximate');
  await expect(page.getByText('进入房间后仍需再次点击“开始共享”')).toBeVisible();

  await selector.selectOption('precise');
  await expect(selector).toHaveValue('precise');
  await selector.selectOption('hidden');
  await expect(selector).toHaveValue('hidden');
});

test('client error reporting contains no error details or coordinates', async ({ page }) => {
  const reports: unknown[] = [];
  await page.route('**/api/telemetry', async (route) => {
    reports.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{"data":{"accepted":true}}' });
  });
  await page.goto('/settings/privacy');
  await page.evaluate(() => window.dispatchEvent(new Event('error')));
  await expect.poll(() => reports.some((report) => (
    report as { event?: string }
  ).event === 'web.crash')).toBe(true);
  expect(reports).toContainEqual({ event: 'web.crash', result: 'error' });
  const encoded = JSON.stringify(reports);
  for (const forbidden of ['longitude', 'latitude', 'message', 'stack', 'payload', 'userId']) {
    expect(encoded).not.toContain(forbidden);
  }
});
