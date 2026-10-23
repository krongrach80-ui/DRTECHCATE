import { defineConfig, globalIgnores } from "eslint/config";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
    },
  },
  {
    files: ["**/__tests__/**", "**/test/**", "tests/**", "**/*.test.ts", "**/*.spec.ts", "scripts/**", "vitest.setup.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Frontend applications must NEVER import @supabase/supabase-js or adminClient (Master Prompt v3 - Section 4)
  {
    files: ["apps/admin/**", "apps/pt/**", "apps/kiosk/**", "packages/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              message: "Frontend apps must NEVER import Supabase directly. All operations must go through Express API.",
            },
            {
              name: "@supabase/ssr",
              message: "Frontend apps must NEVER import Supabase SSR directly.",
            },
          ],
        },
      ],
    },
  },
  // API Controllers must NOT import adminClient directly (must use userClient or privileged services)
  {
    files: ["apps/api/src/modules/**/controller.ts", "apps/api/src/modules/**/routes.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/adminClient*"],
              message: "API routes and controllers must use userClient to enforce RLS. adminClient is restricted to authorized services/repositories only.",
            },
          ],
        },
      ],
    },
  },
  // Production src/ code must NEVER import from test/ directories (1b.9)
  {
    files: ["apps/*/src/**", "packages/*/src/**", "src/**"],
    ignores: ["**/__tests__/**", "**/test/**", "**/tests/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/test/**", "**/tests/**", "**/__tests__/**", "**/fixtures/**"],
              message: "Production source code must NEVER import from test/ or fixture directories.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
    "legacy-src/**",
    "public/*/assets/**",
    "public/admin/assets/**",
    "public/pt/assets/**",
    "public/kiosk/assets/**",
  ]),
]);

export default eslintConfig;
