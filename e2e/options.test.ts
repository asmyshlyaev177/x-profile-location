import { test, expect } from './fixtures';

test.skip('options page loads and shows all sections', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/pages/options.html`);

  await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
  await expect(page.getByText('Highlight tweets by keyword')).toBeVisible();
  await expect(page.getByText('Highlight tweets by flags')).toBeVisible();
  await expect(page.getByText('Replace flags with')).toBeVisible();
  await expect(page.getByText('Show location in feed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear location cache' })).toBeVisible();
});

