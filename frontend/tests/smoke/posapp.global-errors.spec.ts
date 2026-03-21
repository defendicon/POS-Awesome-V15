import { expect, test, type Page } from "@playwright/test";

const POS_PATH = process.env.POSA_SMOKE_PATH || "/app/posapp";

function isBenignErrorMessage(message: string): boolean {
	const normalized = message.toLowerCase();
	return (
		normalized.includes("remove_last_divider") ||
		(normalized.includes("offsetwidth") &&
			normalized.includes("shortcut.js"))
	);
}

async function loginIfCredentialsProvided(page: Page) {
	const username = process.env.POSA_SMOKE_USER;
	const password = process.env.POSA_SMOKE_PASSWORD;

	if (!username || !password) {
		return;
	}

	await page.goto("/login", { waitUntil: "networkidle" });

	const userInput = page.locator(
		'input[name="login_email"], input#login_email',
	);
	const passInput = page.locator(
		'input[name="login_password"], input#login_password',
	);
	const loginButton = page.locator("button.btn-login").or(
		page.locator('button:has-text("Login"), button:has-text("Log In")'),
	);

	if ((await userInput.count()) === 0 || (await passInput.count()) === 0) {
		return;
	}

	await userInput.first().fill(username);
	await passInput.first().fill(password);
	await Promise.all([
		page.waitForURL(/\/app(\/|$)/, { timeout: 60000 }),
		loginButton.first().click(),
	]);
}

test("POS app smoke route has no uncaught global errors", async ({ page }) => {
	const capturedErrors: string[] = [];

	page.on("pageerror", (error) => {
		const message = String(error?.message || error);
		if (!isBenignErrorMessage(message)) {
			capturedErrors.push(`pageerror: ${message}`);
		}
	});

	page.on("console", (msg) => {
		if (msg.type() !== "error") {
			return;
		}
		const text = msg.text();
		if (!isBenignErrorMessage(text)) {
			capturedErrors.push(`console.error: ${text}`);
		}
	});

	await loginIfCredentialsProvided(page);
	await page.goto(POS_PATH, { waitUntil: "domcontentloaded" });

	await expect(page).toHaveURL(new RegExp("/app/(posapp|point-of-sale)"));
	await expect(page.locator(".main-section").first()).toBeVisible();

	await page.waitForTimeout(5000);
	expect(capturedErrors, capturedErrors.join("\n")).toHaveLength(0);
});
