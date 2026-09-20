// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// `pnpm lint` (root) / `pnpm --filter <pkg> lint` were both broken before this file existed:
// eslint was on PATH in some environments but the workspace declared no eslint dependency and
// no config at all, so the command failed everywhere it wasn't accidentally already installed
// globally. This covers the whole pnpm workspace except supabase/functions (Deno has its own
// linter, `deno lint`, and Deno's ambient globals/import style don't fit a Node ESLint config)
// and apps/desktop/src-tauri (Rust, covered by `cargo check`/clippy instead).
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/.tauri/**",
      "**/node_modules/**",
      "**/*.d.ts",
      "supabase/functions/**",
      "apps/desktop/src-tauri/**",
      "**/coverage/**",
      "**/.expo/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // noUncheckedIndexedAccess + strict mode in tsconfig.base.json already forces callers to
      // handle undefined; an unused var/import is real dead-code signal worth keeping as an
      // error, but a leading-underscore escape hatch matches common intentional-discard patterns
      // (e.g. destructuring to skip a value).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // The codebase relies on `as never`/`as unknown as X` casts around the placeholder Supabase
      // Database type (see CLAUDE.md and packages/api-client/src/database.types.ts) — banning
      // `any` outright would fight that pattern in dozens of already-reviewed call sites without
      // catching real bugs, so this stays a warning rather than blocking the lint script.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "apps/mobile/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ["tests/e2e/**/*.ts", "tests/rls/**/*.ts", "scripts/**/*.ts", "**/*.config.ts", "**/*.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Config files loaded by Node/Babel directly (not bundled), so they're plain CommonJS.
    files: ["**/babel.config.js", "**/metro.config.js"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node, ...globals.commonjs } },
  },
);
