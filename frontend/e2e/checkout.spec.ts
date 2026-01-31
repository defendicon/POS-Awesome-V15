import { test, expect } from "@playwright/test";

test.skip("POS checkout smoke test (requires running ERPNext backend)", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page).toHaveTitle(/POS Awesome/i);
});
