import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Netlify build artifacts, created by `netlify build` / `netlify deploy`.
    // Gitignored and machine-generated: linting them buries real findings
    // under thousands of problems locally, while CI never sees the directory.
    ".netlify/**",
  ]),
  {
    rules: {
      // Underscore-prefixed arguments are deliberately unused — common in test
      // mocks that must match a signature they do not fully consume.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
