export type StatusManual = "rascunho" | "em_captura" | "em_revisao" | "publicado";

export type ModoCaptura = "extensao" | "embed";

export interface Manual {
  id: string;
  nome: string;
  sistema: string;
  urlSistema: string;
  projeto: string;
  status: StatusManual;
  modo: ModoCaptura;
  passos: number;
  atualizadoEm: string;
}

export interface Projeto {
  id: string;
  nome: string;
}

export interface Organizacao {
  nome: string;
  plano: string;
}

export type OrigemPasso = "automatico" | "manual";

export type ConfiancaSugestao = "alta" | "baixa";

/**
 * Região sensível SUGERIDA para máscara — nunca desenhada sobre a imagem.
 * Geometria (px da imagem) + categoria/motivo seguro. Nunca contém
 * value/texto do campo.
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
 * Máscara DEFINITIVA de um passo, salva pelo usuário no editor manual de
 * privacidade — separada de `SugestaoMascara` (sem motivo/texto livre).
 * Quando presente (e não vazia) em `PassoGravado.mascarasAplicadas`, tem
 * PRECEDÊNCIA sobre `sugestoesMascara` na renderização (ver dominio/mascara.ts).
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
// Substitui o editor "só máscara": SugestaoMascara/MascaraAplicada acima
// continuam existindo (entrada da extensão / legado), nunca misturadas com
// este modelo — que não carrega motivo/confiança nem é gerado pela extensão.

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
 * Anotação genérica sobre o screenshot — nunca altera o arquivo original, só
 * é composta na renderização. `ordem` só se aplica a `tipo: "numero"`
 * (numeração sequencial 1,2,3... recalculada ao remover um marcador).
 */
export interface AnotacaoImagem {
  id: string;
  tipo: TipoAnotacao;
  geometria: GeometriaAnotacao;
  ordem?: number;
}

export interface PassoGravado {
  id: string;
  ordem: number;
  titulo: string;
  descricao?: string;
  origem: OrigemPasso;
  /** data URL do screenshot — sempre INTACTO (sem blur/máscara automática). Ausente = sem screenshot (manual, ou infraestrutura). */
  imagemRedigida?: string;
  /** true quando NÃO existe screenshot (infra) — nunca por decisão de privacidade. */
  redacaoIncompleta?: boolean;
  /** true quando existem sugestões de máscara (ou incerteza de consolidação) para revisar. */
  revisaoPrivacidadeNecessaria?: boolean;
  /** Sugestões de máscara detectadas — nunca desenhadas sobre `imagemRedigida`; usuário confirma/edita depois. */
  sugestoesMascara?: SugestaoMascara[];
  /** Máscaras definitivas salvas pelo usuário (legado) — mantido para ler passos editados antes do editor de anotações. */
  mascarasAplicadas?: MascaraAplicada[];
  /**
   * Anotações definitivas do editor de imagem (máscara/destaque/seta/número).
   * Quando definido (mesmo `[]`), tem PRECEDÊNCIA sobre `mascarasAplicadas`
   * e `sugestoesMascara` na renderização (ver dominio/anotacao.ts).
   */
  anotacoesImagem?: AnotacaoImagem[];
  /** Identificador estável para a API (PATCH de máscaras/anotações) — mesmo valor do backend; ausente só em etapas manuais (sem correlacaoId do backend). */
  correlacaoId?: string;
}

export interface SessaoGravacao {
  manual: string;
  sistema: string;
}
