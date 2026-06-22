import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
	...baseConfig,
	testMatch: ["performance/**/*.spec.ts"],
	timeout: 300000,
	use: {
		...baseConfig.use,
	},
});
