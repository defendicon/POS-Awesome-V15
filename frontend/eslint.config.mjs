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
			"src/sw.js",
			"src/posawesome.bundle.js",
			"src/posawesome.bundle.*.js",
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
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
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
];
