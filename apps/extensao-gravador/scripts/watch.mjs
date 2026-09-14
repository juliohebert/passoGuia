// Observa src/ e recompila dist/ automaticamente (sem servir HTTP — a extensão
// não precisa de servidor, só do bundle atualizado para "Carregar sem compactação").
import { context } from "esbuild";

const alvos = [
  { entryPoints: ["src/servico.ts"], format: "esm", outfile: "dist/servico.js" },
  { entryPoints: ["src/conteudo.ts"], format: "iife", outfile: "dist/conteudo.js" },
];

const contextos = await Promise.all(
  alvos.map((alvo) => context({ bundle: true, ...alvo })),
);

await Promise.all(contextos.map((ctx) => ctx.watch()));

console.log(
  "[extensao-gravador] observando src/ — dist/ é recompilado automaticamente a cada alteração",
);
