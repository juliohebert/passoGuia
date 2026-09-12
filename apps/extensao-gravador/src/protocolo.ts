import type { EventoCapturado } from "@passoguia/nucleo-gravador";

/** Constantes e formatos do canal content script <-> service worker. */
export const NOME_PORTA = "gravador-eventos";

/** Retângulo {x, y, largura, altura}. Unidade depende do contexto (CSS px ou px de imagem). */
export interface Retangulo {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export interface ViewportCss {
  largura: number;
  altura: number;
}

/** <iframe>/<frame> visível: posição no viewport do frame que o hospeda. */
export interface IframeVisivel {
  rect: Retangulo;
  src: string;
}

/** Confiança da detecção automática — nunca decide mascarar, só orienta a revisão humana. */
export type ConfiancaSugestao = "alta" | "baixa";

/**
 * Uma região sensível detectada — vira SUGESTÃO de máscara, nunca é
 * desenhada automaticamente sobre o screenshot. `retangulo` é geometria
 * pura (CSS px, coordenadas do frame local antes do offset de iframe).
 * `motivo` é sempre uma CATEGORIA segura (ex.: "campo com tipo HTML
 * sensível") — nunca o value/texto do campo.
 */
export interface SugestaoRegiao {
  retangulo: Retangulo;
  confianca: ConfiancaSugestao;
  motivo: string;
}

/**
 * Campos editáveis + estrutura de UM frame, em coordenadas do próprio frame (CSS px).
 * Só geometria + categoria: nunca value/textContent.
 */
export interface RelatorioFrame {
  viewport: ViewportCss;
  /** Regiões sensíveis detectadas neste frame — SUGESTÕES, nunca mascaradas aqui. */
  sugestoes: SugestaoRegiao[];
  iframes: IframeVisivel[];
  /** Heurística: pode haver shadow root FECHADO escondendo campos neste frame. */
  shadowFechadoPossivel: boolean;
  /**
   * epoch (ms) de quando ESTE relatório foi montado no frame. Usado para
   * detectar regiões coletadas depois do estado do screenshot PRE-AÇÃO
   * (re-render/navegação/modal) — nunca aplicadas sobre a imagem.
   */
  instante: number;
}

/** content script -> service worker. */
export type MensagemCS =
  // DIAGNOSTICO TEMP: `diagId` só serve para correlacionar logs desta investigação
  // (clique -> gatilho -> API). Remover junto com o restante do diagnóstico.
  | { tipo: "evento"; evento: EventoCapturado; diagId?: string }
  | {
      tipo: "gatilho";
      evento: EventoCapturado;
      alvoRect: Retangulo;
      relatorio: RelatorioFrame;
      /**
       * true quando o alvo (select/dropdown/menu/autocomplete/modal/popover)
       * provavelmente revela UI transitória só depois deste clique — sinaliza
       * ao service worker que também deve capturar um screenshot POST.
       */
      abreUiTransitoria: boolean;
      diagId?: string;
    }
  | { tipo: "relatorio"; relatorio: RelatorioFrame };

/** service worker -> content script. */
export interface PedirRelatorio {
  tipo: "pedir-relatorio";
}
