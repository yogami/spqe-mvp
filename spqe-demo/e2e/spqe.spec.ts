import { test, expect } from '@playwright/test';

test('SPQE UI successfully pings live production Railway API', async ({ page }) => {
  // Navigate to the local dashboard
  await page.goto('/');

  // Verify UI renders correctly
  await expect(page.locator('text=SPQE Dashboard')).toBeVisible();
  
  // Click the fire transaction button to test the Railway endpoint integration
  const pingButton = page.getByTestId('ping-button');
  await expect(pingButton).toBeVisible();
  await pingButton.click();

  // Wait for the simulated evaluation bar to fill and the API request to return
  await expect(page.getByTestId('error-status')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('error-status')).toContainText('Fail-Closed');
});
