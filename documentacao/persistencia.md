# Persistência da sessão de gravação

A API (`apps/api`) guarda sessão + passos gravados em Postgres via Prisma. O
`ServicoSessaoGravacao` nunca fala com o banco diretamente — depende só de
uma porta (interface), o que mantém a lógica de negócio testável sem banco e
troca de implementação sem tocar no serviço.

```
apps/api/src/sessao-gravacao/
  repositorio-sessao-gravacao.ts            porta (interface + token de DI)
  repositorio-sessao-gravacao.memoria.ts     implementação em memória (testes unitários)
  repositorio-sessao-gravacao.prisma.ts      implementação real (Postgres via Prisma)
  sessao-gravacao.service.ts                 lógica de negócio + broadcast SSE
```

Em runtime (`sessao-gravacao.module.ts`), o token é resolvido para
`RepositorioSessaoGravacaoPrisma`. Os testes unitários do serviço
(`sessao-gravacao.service.spec.ts`) usam `RepositorioSessaoGravacaoMemoria`
diretamente — rápidos, sem precisar de um Postgres rodando.

## Modelo (Prisma)

Duas tabelas: `sessoes_gravacao` e `passos_gravados` (ver
`apps/api/prisma/schema.prisma`). `sugestoesMascara`, `mascarasAplicadas` e
`anotacoesImagem` são colunas JSONB — listas heterogêneas, nunca consultadas
por conteúdo interno, sem necessidade de normalizar em tabelas próprias por
enquanto.

Ponto sensível do mapeamento (`repositorio-sessao-gravacao.prisma.ts`):
coluna JSONB `null` vira campo **ausente** no contrato (`undefined`), nunca
`null` — a web distingue "nunca editado" (ausente) de "editado e esvaziado"
(`[]`) para decidir precedência na renderização. Coberto por teste unitário.

## SSE ainda em memória, por processo

O fluxo de eventos em tempo real (`fluxoDePassos`) usa um `Subject` do RxJS
em memória, por instância da API. Os passos já são duráveis (Postgres), mas
o broadcast SSE não é — rodar mais de uma instância da API ao mesmo tempo
faz cada uma "ver" só os eventos que ela mesma processou. Não é regressão
(sempre foi assim), só uma limitação que fica mais visível agora que os
dados persistem. Resolver isso (Postgres `LISTEN/NOTIFY`, um broker, etc.)
fica para uma etapa futura.
