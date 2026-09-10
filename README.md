# PassoGuia

Monorepo gerenciado com **Turborepo** + **pnpm**.

## Estrutura

```
apps/
  web                  Next.js + React + TypeScript + Tailwind
  api                  NestJS + TypeScript
  laboratorio-gravador App web mínima em TypeScript (base para futura POC)
packages/
  configuracao-typescript  tsconfig compartilhados
  configuracao-eslint      configuração de ESLint compartilhada
  ui                       componentes React compartilhados
```

## Scripts (raiz)

| Comando            | Descrição                          |
| ------------------ | ---------------------------------- |
| `pnpm dev`         | sobe todos os apps em modo watch   |
| `pnpm build`       | build de todos os pacotes          |
| `pnpm lint`        | ESLint em todos os pacotes         |
| `pnpm typecheck`   | checagem de tipos em todos os pacotes |

## Requisitos

- Node.js >= 20
- pnpm 9

## Estado atual

Apenas estrutura inicial (bootstrap). Sem regras de negócio, banco de dados,
autenticação ou gravador implementados.
