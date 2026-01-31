import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.spec.{js,ts}", "tests/**/*.test.{js,ts}"],
		exclude: ["e2e/**", "node_modules/**"],
	},
});
