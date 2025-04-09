import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import jestPlugin from "eslint-plugin-jest";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs}"], plugins: { js }, extends: ["js/recommended"] },
  { files: ["**/*.{js,mjs,cjs}"], languageOptions: { globals: globals.browser } },
  
  {
    files: ["**/tests/**/*.{js,mjs,cjs}"],
    plugins: {
      jest: jestPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.jest,
        describe: "readonly",
        expect: "readonly",
        test: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        jest: "readonly",
      },
    },
    rules: {
      // Add Jest-specific rules
      "jest/no-disabled-tests": "warn",
      "jest/no-focused-tests": "error",
      "jest/no-identical-title": "error",
      "jest/valid-expect": "error",
    },
  },
]);