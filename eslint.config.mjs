import globals from "globals";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier"; // Used to disable ESLint rules that conflict with Prettier

export default tseslint.config(
  {
    // Global ignores
    ignores: [".next/", "node_modules/", "dist/"],
  },
  {
    // Base configuration for all JavaScript/TypeScript files
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "@next/next": nextPlugin,
      "prettier": prettierPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
        project: "./tsconfig.json", // Important for rules that require type information
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2020, // Or es2021, etc., depending on your target
      },
    },
    rules: {
      // Start with Next.js recommended rules (conceptual equivalent of extends 'next/core-web-vitals')
      // nextPlugin.configs.recommended.rules might be a way, or you might need to apply them more granularly
      // For now, we'll manually add your specific rules and Prettier integration
      // This part might need adjustment based on how next/core-web-vitals is exposed in flat config.

      // Your custom rules:
      "prettier/prettier": "error",
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],

      // Add Prettier recommended rules (disables conflicting ESLint rules)
      ...prettierConfig.rules, // This ensures ESLint doesn't report on formatting, letting Prettier do it
      ...nextPlugin.configs.recommended.rules, // Apply Next.js recommended rules
      ...nextPlugin.configs['core-web-vitals'].rules, // Apply Next.js core-web-vitals rules

    },
  },
  // You might have more specific configurations for certain file types or directories
  // For example, a configuration specifically for pages or components.
  {
    // Apply Prettier plugin's recommended configuration
    // This is often done by adding prettierPlugin.configs.recommended,
    // but since we use prettier/prettier rule, this might be sufficient with prettierConfig.rules
  }
); 