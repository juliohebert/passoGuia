/** Contrato do canal página de diagnóstico <-> service worker (prova temporária). */
import type { Retangulo } from "./protocolo";
import type { SugestaoMascara } from "./redacao-visual";

export const TIPO_LISTAR = "diagnostico:listar";

export interface FrameProva {
  dataUrl: string;
  bytes: number;
  instante: number;
}

export interface RegistroProva {
  correlacaoId: string;
  tipoAcao: string;
  seletor?: string;
  /** Screenshot INTACTO (nunca mais redigido/borrado). null quando NENHUMA imagem pôde ser produzida (infra). */
  pre: FrameProva | null;
  /** Qual momento o screenshot acima representa — POST só quando o alvo abriu UI transitória e a captura pós-estabilização deu certo. */
  origemCaptura?: "pre" | "pos";
  /** true => nenhuma imagem existe para este passo (infra: sem PRE-AÇÃO/frame/canvas — nunca privacidade). */
  redacaoIncompleta: boolean;
  /** true => existem sugestões de máscara (ou incerteza de consolidação) para revisar. */
  revisaoPrivacidadeNecessaria?: boolean;
  motivos: string[];
  /** Bounding box do alvo em px da imagem — metadado, nunca desenhado sobre a imagem. */
  caixa?: Retangulo;
  /** Escala CSS -> imagem, usada para posicionar sugestões/destaque no cliente. */
  escala?: { x: number; y: number };
  /** Regiões sensíveis detectadas — SUGESTÕES de máscara, nunca desenhadas sobre `pre.dataUrl`. */
  sugestoesMascara?: SugestaoMascara[];
}

export interface RespostaListar {
  registros: RegistroProva[];
}
