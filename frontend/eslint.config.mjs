import globals from "globals";
import pluginJs from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import pluginVuetify from "eslint-plugin-vuetify";
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
		files: ["**/*.{js,mjs,cjs,ts,vue}"],
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
					caughtErrors: "all",
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
		files: ["**/*.ts", "**/*.vue"],
		rules: {
			"no-undef": "off",
		},
	},
	{
		files: ["src/posapp/workers/opencvWorker.js"],
		languageOptions: {
			globals: {
				...globals.worker,
				importScripts: "readonly",
				cv: "writable",
				self: "readonly",
			},
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
