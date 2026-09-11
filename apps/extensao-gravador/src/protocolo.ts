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

/**
 * Campos editáveis + estrutura de UM frame, em coordenadas do próprio frame (CSS px).
 * Só geometria: nunca value/textContent.
 */
export interface RelatorioFrame {
  viewport: ViewportCss;
  campos: Retangulo[];
  iframes: IframeVisivel[];
  /** Heurística: pode haver shadow root FECHADO escondendo campos neste frame. */
  shadowFechadoPossivel: boolean;
}

/** content script -> service worker. */
export type MensagemCS =
  | { tipo: "evento"; evento: EventoCapturado }
  | {
      tipo: "gatilho";
      evento: EventoCapturado;
      alvoRect: Retangulo;
      relatorio: RelatorioFrame;
    }
  | { tipo: "relatorio"; relatorio: RelatorioFrame };

/** service worker -> content script. */
export interface PedirRelatorio {
  tipo: "pedir-relatorio";
}
