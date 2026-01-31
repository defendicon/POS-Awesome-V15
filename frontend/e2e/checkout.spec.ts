import { test, expect } from "@playwright/test";

test.describe.skip(
	"POS checkout smoke test (requires running ERPNext backend)",
	() => {
		test("loads the POS shell", async ({ page }) => {
			await page.goto("/");
			await expect(page).toHaveTitle(/POS Awesome/i);
		});
	},
);
