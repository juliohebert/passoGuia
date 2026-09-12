import type { AnotacaoImagem, MascaraAplicada, PassoGravado, PassoRecebido, ResumoSessao } from "./contratos";

/**
 * Porta de persistência da sessão de gravação — a lógica de negócio
 * (`ServicoSessaoGravacao`) depende só desta interface, nunca de Prisma
 * diretamente. Duas implementações:
 *  - `RepositorioSessaoGravacaoMemoria`: em memória, usada nos testes
 *    unitários do serviço (rápida, sem banco).
 *  - `RepositorioSessaoGravacaoPrisma`: Postgres via Prisma, usada em runtime.
 *
 * O broadcast em tempo real (SSE) NÃO faz parte desta porta — é responsabilidade
 * do próprio serviço (RxJS `Subject` em memória, por processo), independente
 * de onde os dados são persistidos.
 */
export interface RepositorioSessaoGravacao {
  /** Garante que a sessão existe (cria se necessário) e devolve o resumo atual. Idempotente. */
  garantirSessao(sessaoId: string): Promise<ResumoSessao>;

  /** Registra um passo novo, atribuindo `ordem` sequencial dentro da sessão. */
  registrarPasso(sessaoId: string, recebido: PassoRecebido): Promise<PassoGravado>;

  /** Passos da sessão, ordenados por `ordem`. */
  listarPassos(sessaoId: string): Promise<PassoGravado[]>;

  /** Substitui a lista de máscaras aplicadas do passo. `undefined` se o passo não existe na sessão. */
  atualizarMascaras(
    sessaoId: string,
    correlacaoId: string,
    mascaras: MascaraAplicada[],
  ): Promise<PassoGravado | undefined>;

  /** Substitui a lista de anotações do passo. `undefined` se o passo não existe na sessão. */
  atualizarAnotacoes(
    sessaoId: string,
    correlacaoId: string,
    anotacoes: AnotacaoImagem[],
  ): Promise<PassoGravado | undefined>;
}

/** Token de injeção — o módulo decide qual implementação prover. */
export const REPOSITORIO_SESSAO_GRAVACAO = Symbol("REPOSITORIO_SESSAO_GRAVACAO");
