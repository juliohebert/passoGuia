# PassoGuia

Gravador de passos de uso de sistemas web: uma extensão Chromium captura
cliques/preenchimentos/navegação com screenshot, envia para uma API que
guarda a sessão de gravação, e uma web app mostra os passos em tempo real
para revisão (privacidade, anotações de imagem, edição manual).

Monorepo gerenciado com **Turborepo** + **pnpm**.

## Estrutura

```
apps/
  web                  Next.js — tela de gravação, revisão e editor de imagem
  api                  NestJS — sessão de gravação, persistência, SSE
  extensao-gravador    Extensão Chromium (Manifest V3) — captura os passos
  embed-gravador       Bundle standalone do núcleo de gravação (embutível numa página)
  laboratorio-gravador App mínima para testar a captura manualmente
packages/
  nucleo-gravador          Lógica de captura/normalização de eventos, compartilhada
  configuracao-typescript  tsconfig compartilhados
  configuracao-eslint      configuração de ESLint compartilhada
  ui                       componentes React compartilhados
```

## Stack

- TypeScript em todo o monorepo
- **web**: Next.js (App Router) + React + Tailwind
- **api**: NestJS + Prisma + PostgreSQL
- **extensao-gravador**: Manifest V3, `esbuild` para o bundle
- Testes: Vitest (todos os pacotes) + Testing Library (web)
- pnpm workspaces + Turborepo (cache/orquestração das tasks)

## Requisitos

- Node.js >= 20
- pnpm 9
- Docker (para o Postgres local — ver abaixo)
- Google Chrome/Chromium (para carregar a extensão)

## Instalação

```bash
pnpm install
```

## Rodando localmente

```bash
npm start
```

Sobe `apps/web` (Next dev), `apps/api` (Nest dev) e `apps/extensao-gravador`
(rebuild automático do bundle a cada alteração em `src/`) juntos via Turbo,
depois de checar se as portas 3000/3333 já não estão em uso. Precisa do
Postgres local rodando (próxima seção) para a API subir sem erro.

`pnpm dev` faz o mesmo, mas sobe **todos** os apps do monorepo (inclui
`laboratorio-gravador`/`embed-gravador`).

## Postgres local + Prisma

A API persiste em PostgreSQL via Prisma (`apps/api/prisma/schema.prisma`).

1. Suba o Postgres local (Docker):
   ```bash
   cd apps/api
   docker compose up -d
   ```
2. Configure a `DATABASE_URL` copiando o exemplo (já compatível com as
   credenciais do `docker-compose.yml`):
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```
3. Aplique as migrations:
   ```bash
   pnpm --filter api prisma:migrate
   ```

Scripts do Prisma disponíveis em `apps/api`:

| Comando                          | Descrição                                   |
| --------------------------------- | -------------------------------------------- |
| `pnpm --filter api prisma:generate` | gera o Prisma Client a partir do schema     |
| `pnpm --filter api prisma:migrate`  | cria/aplica migrations em dev                |
| `pnpm --filter api prisma:deploy`   | aplica migrations existentes (staging/prod)  |

Detalhes da arquitetura de persistência (porta + repositório em memória +
repositório Prisma, e por que é assim) estão em
[`documentacao/persistencia.md`](documentacao/persistencia.md).

## Comandos (raiz — todos os pacotes via Turbo)

| Comando          | Descrição                          |
| ---------------- | ----------------------------------- |
| `pnpm test`      | testes (Vitest) de todos os pacotes |
| `pnpm typecheck` | checagem de tipos de todos os pacotes |
| `pnpm lint`      | ESLint em todos os pacotes          |
| `pnpm build`     | build de todos os pacotes           |

Rode `pnpm --filter <pacote> <script>` para um pacote específico (ex.:
`pnpm --filter api test`).

## Carregando/recarregando a extensão no Chrome

1. Garanta que `apps/extensao-gravador/dist/` existe: `pnpm --filter extensao-gravador build`
   (ou deixe `npm start` rodando, que já recompila a cada alteração).
2. No Chrome: `chrome://extensions` → ative o **Modo do desenvolvedor**.
3. **Carregar sem compactação** → selecione a pasta `apps/extensao-gravador`
   (a que tem o `manifest.json`, não a `dist/`).
4. Depois de qualquer alteração em `src/`, com `npm start` rodando o `dist/`
   já está atualizado — clique em **Recarregar** no card da extensão em
   `chrome://extensions` para o navegador pegar o novo `dist/`.

## Limitações conhecidas

- SSE (eventos em tempo real da tela de gravação) ainda é em memória, por
  processo — não sobrevive a múltiplas instâncias da API rodando ao mesmo
  tempo (ver [`documentacao/persistencia.md`](documentacao/persistencia.md)).
- Sem auth/multi-tenant ainda.
- Alguns elementos/interações específicas do QuarkClinic ainda podem não ser
  reconhecidos como passos pela extensão — investigação de cobertura de
  cliques ficou para uma próxima etapa.
