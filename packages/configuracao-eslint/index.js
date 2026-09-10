import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Configuração base de ESLint compartilhada pelo monorepo.
 * Cada pacote pode estender este array e acrescentar `ignores` próprios.
 */
export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
