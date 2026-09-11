/** Contrato do canal página de diagnóstico <-> service worker (prova temporária). */
import type { Retangulo } from "./protocolo";

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
  /** Screenshot redigido + destacado. null quando a redação NÃO pôde ser garantida. */
  pre: FrameProva | null;
  /** true => nenhum screenshot é exibido nem fica elegível para persistência futura. */
  redacaoIncompleta: boolean;
  motivos: string[];
  /** Bounding box do alvo em px da imagem. */
  caixa?: Retangulo;
  /** Escala CSS -> imagem usada no destaque. */
  escala?: { x: number; y: number };
}

export interface RespostaListar {
  registros: RegistroProva[];
}
