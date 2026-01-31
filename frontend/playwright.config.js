/* global process */
import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	timeout: 60000,
	retries: 0,
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173",
		headless: true,
		trace: "retain-on-failure",
	},
	webServer: {
		command: "yarn dev --host 0.0.0.0 --port 5173",
		url: "http://localhost:5173",
		reuseExistingServer: !process.env.CI,
		timeout: 120000,
	},
});
