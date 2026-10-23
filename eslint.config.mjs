import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "@next/next/no-html-link-for-pages": "off",
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
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",
    "legacy-src/**",
  ]),
]);

export default eslintConfig;
