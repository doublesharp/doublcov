import js from "@eslint/js";
import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-types/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/.tmp/**",
      "**/*.tsbuildinfo",
      "fixtures/**",
      ".github/**",
      "apps/web/dist/**",
      "tests/e2e/**",
      "playwright.config.ts",
      "**/.stryker-tmp/**",
      "**/reports/**",
    ],
  },
  js.configs.recommended,
  // Type-aware rules ONLY for source files in each package's project. Tests,
  // configs, and scripts are linted with syntactic rules only.
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({
    ...c,
    files: [
      "packages/coverage-core/src/**/*.ts",
      "packages/cli/src/**/*.ts",
      "apps/web/src/**/*.ts",
      "apps/web/src/**/*.vue",
    ],
  })),
  {
    files: [
      "packages/coverage-core/src/**/*.ts",
      "packages/cli/src/**/*.ts",
      "apps/web/src/**/*.ts",
    ],
    languageOptions: {
      parserOptions: {
        project: [
          "packages/coverage-core/tsconfig.json",
          "packages/cli/tsconfig.json",
          "apps/web/tsconfig.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { fixStyle: "inline-type-imports" },
      ],
      // Non-null assertions are used deliberately in this codebase to mark
      // documented unreachable defensive fallbacks (see comments at sites in
      // report.ts) and to avoid `?? defaultLcov` chains when the surrounding
      // code already guarantees non-null. Disabled rather than litter every
      // site with eslint-disable comments.
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Builder prepareRun methods are typed `Promise<...>` because most
      // implementations DO need async I/O. The simple ones don't, and
      // forcing `Promise.resolve(...)` everywhere obscures the surface.
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },
  // Syntactic-only TS rules for tests, configs, and any other .ts file.
  {
    files: ["**/*.ts", "**/*.mts", "**/*.tsx"],
    ignores: [
      "packages/coverage-core/src/**/*.ts",
      "packages/cli/src/**/*.ts",
      "apps/web/src/**/*.ts",
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: "module" },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-undef": "off", // TS handles this via the test tsconfigs
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        project: ["apps/web/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".vue"],
      },
      globals: { ...globals.browser },
    },
    plugins: { vue },
    rules: {
      ...vue.configs["flat/recommended"].at(-1).rules,
      "vue/multi-word-component-names": "off",
      "vue/html-self-closing": "off",
      // Match the source-file rule shape — vue files use the same parser
      // chain via vue-eslint-parser + tseslint.parser, but type resolution
      // can collapse to `any` under some CI environments and would fire a
      // wall of unsafe-* errors. Keep the type-aware checks that don't
      // depend on every member resolving (no-floating-promises etc.) and
      // turn off the no-unsafe-* family.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-redundant-type-constituents": "warn",
    },
  },
  {
    files: ["**/*.mjs", "**/*.cjs", "**/*.js"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: { ...globals.node },
    },
  },
);
