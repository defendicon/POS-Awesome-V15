import globals from "globals";
import pluginJs from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import pluginVuetify from "eslint-plugin-vuetify";
import vueParser from "vue-eslint-parser";

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: [
      "frontend/src/libs/**",
      "frontend/src/posawesome.bundle.js",
      "frontend/src/posawesome.bundle.*.js",
      "frontend/src/**/*.d.ts",
      "posawesome/public/dist/**",
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
        locals: "readonly",
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
      "no-regex-spaces": "warn",
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
    },
  },
  {
    files: [
      "**/*.config.{js,mjs,cjs}",
      "electron/**/*.{js,mjs,cjs}",
      "scripts/**/*.{js,mjs,cjs}",
      "**/*.spec.{js,mjs,cjs,ts,tsx}",
      "**/*.test.{js,mjs,cjs,ts,tsx}",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
  {
    files: ["frontend/src/posapp/workers/**/*.js"],
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
    files: ["posawesome/posawesome/page/posapp/onscan.js"],
    languageOptions: {
      globals: {
        define: "readonly",
        module: "readonly",
        oOptions: "readonly",
      },
    },
  },
  {
    files: ["posawesome/www/sw.js"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
];
