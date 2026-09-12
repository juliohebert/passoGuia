/**
 * Contratos da sessão de gravação. Nomes de domínio em português.
 * Espelham os tipos de ação do @passoguia/nucleo-gravador sem depender dele.
 */

export const TIPOS_ACAO = ["CLIQUE", "PREENCHIMENTO", "ROLAGEM", "NAVEGACAO"] as const;
export type TipoAcao = (typeof TIPOS_ACAO)[number];

export const CONFIANCAS_SUGESTAO = ["alta", "baixa"] as const;
export type ConfiancaSugestao = (typeof CONFIANCAS_SUGESTAO)[number];

/**
 * Região sensível SUGERIDA para máscara — nunca desenhada sobre a imagem.
 * Geometria (px da imagem) + categoria/motivo seguro. Nunca contém
 * value/texto do campo, só a categoria de por que foi sinalizada.
 */
export interface SugestaoMascara {
  x: number;
  y: number;
  largura: number;
  altura: number;
  motivo: string;
  confianca: ConfiancaSugestao;
}

export const ORIGENS_MASCARA = ["sugestao", "manual"] as const;
export type OrigemMascara = (typeof ORIGENS_MASCARA)[number];

/**
 * Máscara DEFINITIVA de um passo — decidida pelo usuário no editor manual de
 * privacidade (nunca gerada/enviada pela extensão). Separada de
 * `SugestaoMascara`: sem motivo/confiança (nunca carrega texto livre), só a
 * geometria final + de onde veio (sugestão aceita/ajustada, ou desenhada à
 * mão) + se está ativa (o usuário pode desativar sem perder o retângulo).
 */
export interface MascaraAplicada {
  id: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  origem: OrigemMascara;
  ativa: boolean;
}

// --- Anotações de imagem (editor genérico: máscara/destaque/seta/número) ---
// Substitui o editor "só máscara" — SugestaoMascara/MascaraAplicada acima
// continuam existindo (entrada da extensão / legado), mas o editor manual
// agora trabalha neste modelo único e mais genérico, nunca misturado com
// SugestaoMascara (que carrega motivo/confiança e nunca é editável à mão).

export const TIPOS_ANOTACAO = ["mascara", "destaque", "seta", "numero"] as const;
export type TipoAnotacao = (typeof TIPOS_ANOTACAO)[number];

/** Retângulo — usado por "mascara" (oculta) e "destaque" (contorno, nunca oculta). */
export interface GeometriaRetangulo {
  tipo: "retangulo";
  x: number;
  y: number;
  largura: number;
  altura: number;
}

/** Do ponto inicial ao final — usado por "seta". */
export interface GeometriaSeta {
  tipo: "seta";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Um ponto — usado por "numero" (marcador circular). */
export interface GeometriaPonto {
  tipo: "ponto";
  x: number;
  y: number;
}

export type GeometriaAnotacao = GeometriaRetangulo | GeometriaSeta | GeometriaPonto;

/**
 * Anotação genérica sobre o screenshot — nunca altera o arquivo original,
 * só é composta na renderização (card/preview/editor). `ordem` só se aplica
 * a `tipo: "numero"` (numeração sequencial 1,2,3... recalculada ao remover
 * um marcador — ver dominio/anotacao.ts na web).
 */
export interface AnotacaoImagem {
  id: string;
  tipo: TipoAnotacao;
  geometria: GeometriaAnotacao;
  ordem?: number;
}

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
  /** true => existem sugestões de máscara (ou incerteza de consolidação) para revisar. */
  revisaoPrivacidadeNecessaria: boolean;
  /** Sugestões de máscara — nunca desenhadas sobre `imagemRedigida`. Ausente/vazio quando nenhuma foi detectada. */
  sugestoesMascara?: SugestaoMascara[];
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
  /**
   * Máscaras DEFINITIVAS salvas pelo usuário no editor manual (legado) —
   * nunca enviadas pela extensão, só via PATCH .../mascaras. Mantido para
   * ler passos já editados antes do editor de anotações existir.
   */
  mascarasAplicadas?: MascaraAplicada[];
  /**
   * Anotações DEFINITIVAS do editor de imagem (máscara/destaque/seta/número)
   * — nunca enviadas pela extensão, só via PATCH .../anotacoes. Quando
   * definido (mesmo `[]`), tem PRECEDÊNCIA sobre `mascarasAplicadas` e
   * `sugestoesMascara` na renderização.
   */
  anotacoesImagem?: AnotacaoImagem[];
}

export interface ResumoSessao {
  sessaoId: string;
  criadaEm: number;
  totalPassos: number;
}
