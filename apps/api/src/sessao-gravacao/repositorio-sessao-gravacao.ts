import type {
  AnotacaoImagem,
  AtualizacaoImagemPasso,
  AtualizacaoManual,
  AtualizacaoRevisaoPasso,
  AtualizacaoPasso,
  MascaraAplicada,
  ModoCaptura,
  PassoGravado,
  PassoManualRecebido,
  PassoRecebido,
  ResumoSessao,
  EstadoManual,
} from "./contratos";

/** Dados de criação de uma sessão real (vindos do formulário "Novo manual"). */
export interface DadosCriacaoSessao {
  nome: string;
  descricao?: string;
  url?: string;
  modo: ModoCaptura;
}

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
  /**
   * Garante que a sessão existe (cria com `dados` se necessário) e devolve o
   * resumo atual. Idempotente: se a sessão já existe, `dados` é ignorado —
   * nome/url/modo só são gravados na criação.
   */
  garantirSessao(sessaoId: string, dados: DadosCriacaoSessao): Promise<ResumoSessao>;

  /**
   * Busca uma sessão já existente, sem criar. `undefined` se `sessaoId` não
   * corresponde a nenhuma sessão — usado para a web reportar "sessão não
   * encontrada" em vez de seguir com uma sessão vazia criada na hora.
   */
  buscarSessao(sessaoId: string): Promise<ResumoSessao | undefined>;

  /**
   * Atualiza a `url` (origem) da sessão — chamado pela extensão ao ativar a
   * captura numa aba, com a origem real detectada, nunca informada pelo
   * usuário. Sobrescreve qualquer valor anterior (inclusive de sessões
   * antigas criadas com URL manual — a origem detectada automaticamente é
   * sempre a mais atual). Nunca cria a sessão: `undefined` se `sessaoId` não
   * existe.
   */
  atualizarUrl(sessaoId: string, url: string): Promise<ResumoSessao | undefined>;

  atualizarManual(sessaoId: string, dados: AtualizacaoManual): Promise<ResumoSessao | undefined>;
  atualizarEstado(sessaoId: string, estado: EstadoManual): Promise<ResumoSessao | undefined>;
  confirmarGuia(sessaoId: string): Promise<ResumoSessao | undefined>;

  /** Registra um passo novo, atribuindo `ordem` sequencial dentro da sessão. */
  registrarPasso(sessaoId: string, recebido: PassoRecebido): Promise<PassoGravado>;

  atualizarImagem(
    sessaoId: string,
    correlacaoId: string,
    dados: AtualizacaoImagemPasso,
  ): Promise<PassoGravado | undefined>;

  atualizarRevisaoPasso(
    sessaoId: string,
    correlacaoId: string,
    dados: AtualizacaoRevisaoPasso,
  ): Promise<PassoGravado | undefined>;

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

  /** Cria um passo manual (origem "manual", sem screenshot), ao final da sessão. */
  criarPassoManual(sessaoId: string, dados: PassoManualRecebido): Promise<PassoGravado>;

  /** Atualiza título/descrição de um passo existente. `undefined` se não existe na sessão. */
  atualizarTituloDescricao(
    sessaoId: string,
    correlacaoId: string,
    dados: AtualizacaoPasso,
  ): Promise<PassoGravado | undefined>;

  /** Exclui um passo da sessão e recompacta a `ordem` dos restantes (1..N, sem buracos). */
  excluirPasso(sessaoId: string, correlacaoId: string): Promise<boolean>;

  /**
   * Reordena os passos da sessão conforme a lista de `correlacaoId` (posição
   * = índice + 1). Devolve a lista completa já reordenada, ou `undefined` se
   * algum `correlacaoId` não pertence à sessão (nada é alterado nesse caso).
   */
  reordenarPassos(sessaoId: string, ordemCorrelacaoIds: string[]): Promise<PassoGravado[] | undefined>;
}

/** Token de injeção — o módulo decide qual implementação prover. */
export const REPOSITORIO_SESSAO_GRAVACAO = Symbol("REPOSITORIO_SESSAO_GRAVACAO");
