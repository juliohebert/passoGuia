/**
 * Contratos da sessão de gravação. Nomes de domínio em português.
 * Espelham os tipos de ação do @passoguia/nucleo-gravador sem depender dele.
 */

export const TIPOS_ACAO = ["CLIQUE", "PREENCHIMENTO", "ROLAGEM", "NAVEGACAO"] as const;
export type TipoAcao = (typeof TIPOS_ACAO)[number];

/**
 * Passo já normalizado e protegido, como a extensão envia.
 * Nunca contém value/texto digitado/evento bruto — só o que a extensão já normalizou.
 */
export interface PassoRecebido {
  correlacaoId: string;
  tipoAcao: TipoAcao;
  titulo: string;
  /** Descrição/instrução humana do passo (ex.: "No menu, clique em Agendamentos."). */
  descricao: string;
  seletor?: string;
  urlOrigem?: string;
  /** data URL do screenshot — sempre INTACTO, nunca mascarado automaticamente. Ausente só por razão de infraestrutura. */
  imagemRedigida?: string;
  /** true só quando NÃO existe imagem (infra: sem PRE-AÇÃO/frame/canvas — nunca privacidade). */
  redacaoIncompleta: boolean;
  /** epoch (ms) de quando o passo ocorreu no cliente. */
  ocorridoEm: number;
}

/** Passo persistido na sessão (em memória) e devolvido à web. */
export interface PassoGravado extends PassoRecebido {
  id: string;
  ordem: number;
  origem: "automatico";
  /** epoch (ms) de quando a API registrou o passo. */
  registradoEm: number;
}

export interface ResumoSessao {
  sessaoId: string;
  criadaEm: number;
  totalPassos: number;
}
