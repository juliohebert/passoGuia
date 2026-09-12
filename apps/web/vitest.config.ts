import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Só resolve o alias "@/*" (já usado em todo o app via tsconfig "paths",
 * reconhecido pelo Next.js em build/dev) para os testes em vitest — sem
 * isso, imports runtime (não type-only) com "@/..." falham ao resolver.
 */
export default defineConfig({
  // tsconfig usa jsx:"preserve" (Next.js faz o transform via SWC) — sem isto
  // o esbuild do Vite não sabe como tratar JSX nos testes ("React is not defined").
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // "globals: true" é o que faz o @testing-library/react registrar a
    // limpeza automática do DOM (afterEach(cleanup)) entre testes — sem
    // isso, renders de um `it()` vazam para o próximo no mesmo arquivo.
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
