import { mergeConfig } from "vite";
import viteConfig from "./vite.config.js";

const testViteConfig = {
	...viteConfig,
	// The Frappe style extractor writes beside source files during transforms.
	// Keep the existing compiler configuration, but never write build CSS in tests.
	plugins: viteConfig.plugins.filter((plugin) => plugin.name !== "frappe-vue-style"),
};

export default mergeConfig(testViteConfig, {
	test: {
		include: [
			"tests/**/*.spec.{js,ts}",
			"tests/**/*.test.{js,ts}",
			"src/**/__tests__/**/*.{js,ts}",
		],
		exclude: ["tests/smoke/**", "tests/e2e/**", "tests/performance/TTI.spec.ts"],
	},
});
