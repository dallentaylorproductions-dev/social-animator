import { test, expect } from '@playwright/test';

test('marketing page loads and has the expected title text', async ({ page }) => {
  await page.goto('/');
  // The page should load without an error.
  await expect(page).not.toHaveURL(/error/i);
  // The page should contain some recognizable text. Adjust this selector if the
  // marketing page hero text has changed since this test was written.
  await expect(page.locator('body')).toContainText(/realtors/i);
});
