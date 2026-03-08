import { expect, test, type Page } from "@playwright/test";

const POS_PATH = process.env.POSA_SMOKE_PATH || "/app/posapp";
const VISUAL_ENABLED = process.env.POSA_ENABLE_VISUAL_REGRESSION === "1";

async function loginIfCredentialsProvided(page: Page) {
	const username = process.env.POSA_SMOKE_USER;
	const password = process.env.POSA_SMOKE_PASSWORD;

	if (!username || !password) {
		return;
	}

	await page.goto("/login", { waitUntil: "networkidle" });
	const userInput = page.locator('input[name="login_email"], input#login_email');
	const passInput = page.locator('input[name="login_password"], input#login_password');
	const loginButton = page.locator('button:has-text("Login"), button:has-text("Log In")');

	if ((await userInput.count()) === 0 || (await passInput.count()) === 0) {
		return;
	}

	await userInput.first().fill(username);
	await passInput.first().fill(password);
	await loginButton.first().click();
	await page.waitForLoadState("networkidle");
}

test.skip(!VISUAL_ENABLED, "Set POSA_ENABLE_VISUAL_REGRESSION=1 to run visual baseline checks.");

test("POS app visual baseline", async ({ page }) => {
	await loginIfCredentialsProvided(page);
	await page.goto(POS_PATH, { waitUntil: "networkidle" });
	await expect(page.locator(".main-section").first()).toBeVisible();

	await page.setViewportSize({ width: 1440, height: 900 });
	await page.waitForTimeout(1500);

	await expect(page.locator(".main-section").first()).toHaveScreenshot(
		"posapp-main-layout.png",
		{
			animations: "disabled",
			caret: "hide",
			maxDiffPixelRatio: 0.02,
		},
	);
});
