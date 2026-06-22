import { mergeConfig } from "vite";
import viteConfig from "./vite.config.js";

export default mergeConfig(viteConfig, {
	test: {
		include: [
			"tests/**/*.spec.{js,ts}",
			"tests/**/*.test.{js,ts}",
			"src/**/__tests__/**/*.{js,ts}",
		],
		exclude: ["tests/smoke/**", "tests/e2e/**", "tests/performance/TTI.spec.ts"],
	},
});
