import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Carrega apps/api/.env (DATABASE_URL) para process.env antes dos testes —
// só usado pelos testes de integração do repositório Prisma (pulados
// automaticamente quando DATABASE_URL não está definido).
config();

export default defineConfig({
  test: {},
});
