import globals from "globals";
import pluginJs from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import pluginVuetify from "eslint-plugin-vuetify";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import vueParser from "vue-eslint-parser";

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
	{
		ignores: [
			"src/libs/**",
			"src/lib/**",
			"src/posawesome.bundle.js",
			"src/posawesome.bundle.*.js",
			"**/*.d.ts",
		],
	},
	{
		files: ["**/*.{js,mjs,cjs,ts,tsx,vue}"],
		languageOptions: {
			parser: vueParser,
			parserOptions: {
				ecmaVersion: 2020,
				sourceType: "module",
				parser: "@typescript-eslint/parser",
			},
			globals: {
				...globals.browser,
				frappe: "readonly",
				__: "readonly",
				$: "readonly",
				get_currency_symbol: "readonly",
				flt: "readonly",
				workbox: "readonly",
				__BUILD_VERSION__: "readonly",
			},
		},
		plugins: {
			"@typescript-eslint": typescriptEslint,
			vue: pluginVue,
			vuetify: pluginVuetify,
		},
		rules: {
			...pluginJs.configs.recommended.rules,
			...pluginVue.configs["flat/essential"].find((c) => c.rules)?.rules,
			...pluginVuetify.configs["flat/base"][0].rules,
			"no-unused-vars": [
				"warn",
				{
					argsIgnorePattern: "^_|^this$",
					varsIgnorePattern: "^_",
					caughtErrors: "none",
					caughtErrorsIgnorePattern: "^_",
				},
			],
			"no-redeclare": "warn",
			"no-useless-escape": "warn",
			"no-async-promise-executor": "warn",
			"no-dupe-keys": "warn",
			"no-self-assign": "warn",
			"vuetify/no-deprecated-props": "warn",
			"vuetify/no-deprecated-classes": "warn",
		},
	},
	{
		files: ["**/*.vue"],
		processor: pluginVue.processors[".vue"],
	},
	{
		files: ["**/*.{ts,tsx,vue}"],
		rules: {
			"no-undef": "off",
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					argsIgnorePattern: "^_|^this$",
					varsIgnorePattern: "^_",
					caughtErrors: "none",
					caughtErrorsIgnorePattern: "^_",
				},
			],
		},
	},
	{
		files: ["tests/performance/k6-load-test.js"],
		languageOptions: {
			globals: {
				__ENV: "readonly",
			},
		},
	},
	{
		files: ["src/posapp/workers/**/*.js"],
		languageOptions: {
			globals: {
				...globals.worker,
				importScripts: "readonly",
				self: "readonly",
			},
		},
	},
	{
		files: ["src/posapp/workers/opencvWorker.js"],
		languageOptions: {
			globals: {
				cv: "writable",
			},
		},
	},
	{
		files: [
			"src/posapp/components/pos/shell/BarcodePrinting.vue",
			"src/posapp/composables/pos/items/useBarcodePrintOutput.ts",
			"src/posapp/services/exportService.ts",
		],
		rules: {
			// Escaped closing script tags keep embedded receipt HTML from ending SFC scripts.
			"no-useless-escape": "off",
		},
	},
	{
		files: ["**/*.config.js", "**/*.spec.js", "**/*.test.js"],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
];
