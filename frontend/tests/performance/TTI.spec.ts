import { expect, test, type Page } from "@playwright/test";

const POS_PATH = process.env.POSA_SMOKE_PATH || "/app/posapp";
const SKIP_TESTS = Boolean(process.env.CI) && !Boolean(process.env.POSA_SMOKE_BASE_URL);

async function loginIfCredentialsProvided(page: Page) {
	const username = process.env.POSA_SMOKE_USER;
	const password = process.env.POSA_SMOKE_PASSWORD;
	if (!username || !password) return;
	await page.goto("/login", { waitUntil: "networkidle" });
	const userInput = page.locator('input[name="login_email"], input#login_email');
	const passInput = page.locator('input[name="login_password"], input#login_password');
	const loginButton = page.locator("button.btn-login").or(
		page.locator('button:has-text("Login"), button:has-text("Log In")'),
	);
	if ((await userInput.count()) === 0 || (await passInput.count()) === 0) return;
	await userInput.first().fill(username);
	await passInput.first().fill(password);
	await Promise.all([
		page.waitForURL(/\/app(\/|$)/, { timeout: 60000 }),
		loginButton.first().click(),
	]);
}

const describeFn = SKIP_TESTS ? test.describe.skip : test.describe;

describeFn("POS app time-to-interactive benchmarks", () => {
	test("measures TTFB, first paint, and time-to-interactive on cold load", async ({ page }) => {
		await loginIfCredentialsProvided(page);

		const timings: Record<string, number> = {};
		const errors: string[] = [];
		let heapUsedAtInteractive = 0;

		page.on("pageerror", (error) => errors.push(String(error?.message || error)));

		await page.goto(POS_PATH, { waitUntil: "commit" });
		timings["ttfb"] = performance.now();

		await page.waitForSelector("body", { timeout: 30000 });
		timings["firstPaint"] = performance.now();

		await page.locator(".main-section").first().waitFor({ state: "visible", timeout: 60000 });
		timings["interactive"] = performance.now();

		await page.waitForTimeout(2000);
		timings["settled"] = performance.now();

		heapUsedAtInteractive = await page.evaluate(() =>
			(performance as any).memory?.usedJSHeapSize || 0,
		);

		const ttfb = timings["ttfb"];
		const firstPaint = timings["firstPaint"] - timings["ttfb"];
		const tti = timings["interactive"] - timings["ttfb"];
		const settleTime = timings["settled"] - timings["ttfb"];

		console.log(`\n[TTI metrics]`);
		console.log(`  TTFB (wall):          ${ttfb.toFixed(0)}ms`);
		console.log(`  First paint:          ${firstPaint.toFixed(0)}ms`);
		console.log(`  Time-to-interactive:  ${tti.toFixed(0)}ms`);
		console.log(`  Settle (2s after TTI):${settleTime.toFixed(0)}ms`);
		console.log(`  JS heap (interactive):${(heapUsedAtInteractive / 1_048_576).toFixed(1)}MB`);
		console.log(`  Global errors:        ${errors.length}`);

		expect(errors, `Page errors: ${errors.join("; ")}`).toHaveLength(0);
		expect(tti, "TTI exceeds 15s threshold").toBeLessThan(15000);
	});

	test("measures search interaction latency after app is settled", async ({ page }) => {
		await loginIfCredentialsProvided(page);
		await page.goto(POS_PATH, { waitUntil: "networkidle" });
		await page.locator(".main-section").first().waitFor({ state: "visible", timeout: 60000 });

		const searchInput = page.locator(
			'input[type="text"][placeholder*="Search"], input[type="search"], ' +
			'.v-field input, .v-text-field input',
		).first();

		await searchInput.waitFor({ state: "visible", timeout: 30000 });

		const searchTimings: number[] = [];
		for (let i = 0; i < 10; i++) {
			const before = performance.now();
			await searchInput.fill(`ITEM-${String(i).padStart(5, "0")}`);
			await page.waitForTimeout(300);
			if (i > 0) {
				searchTimings.push((performance.now() - before) - 300);
			}
		}

		const avgSearch = searchTimings.reduce((a, b) => a + b, 0) / searchTimings.length;
		const maxSearch = Math.max(...searchTimings);

		console.log(`\n[search latency (10 iterations, excluding 300ms settle)]`);
		console.log(`  Average: ${avgSearch.toFixed(1)}ms`);
		console.log(`  Maximum: ${maxSearch.toFixed(1)}ms`);

		expect(avgSearch, `Average search latency ${avgSearch.toFixed(1)}ms > 500ms threshold`)
			.toBeLessThan(500);
	});

	test("records JS heap snapshot during normal operation", async ({ page }) => {
		await loginIfCredentialsProvided(page);
		await page.goto(POS_PATH, { waitUntil: "networkidle" });
		await page.locator(".main-section").first().waitFor({ state: "visible", timeout: 60000 });
		await page.waitForTimeout(3000);

		const heapInfo = await page.evaluate(() => {
			const mem = (performance as any).memory;
			if (!mem) return null;
			return {
				usedJSHeapSize: mem.usedJSHeapSize,
				totalJSHeapSize: mem.totalJSHeapSize,
				jsHeapSizeLimit: mem.jsHeapSizeLimit,
			};
		});

		if (heapInfo) {
			const usedMB = (heapInfo.usedJSHeapSize / 1_048_576).toFixed(1);
			const totalMB = (heapInfo.totalJSHeapSize / 1_048_576).toFixed(1);
			const limitMB = (heapInfo.jsHeapSizeLimit / 1_048_576).toFixed(1);
			console.log(`\n[JS heap]`);
			console.log(`  Used:  ${usedMB}MB`);
			console.log(`  Total: ${totalMB}MB`);
			console.log(`  Limit: ${limitMB}MB`);

			expect(heapInfo.usedJSHeapSize,
				`JS heap ${usedMB}MB exceeds 500MB threshold`)
				.toBeLessThan(500 * 1_048_576);
		} else {
			console.log(`\n[JS heap] --no-js-flags=--max-old-space-size, skipping memory assertion`);
		}
	});
});
