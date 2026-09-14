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
  | { tipo: "evento"; evento: EventoCapturado }
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
    }
  | { tipo: "relatorio"; relatorio: RelatorioFrame }
  | { tipo: "mudanca-pos-acao"; instanteApontar: number };

/** service worker -> content script. */
export interface PedirRelatorio {
  tipo: "pedir-relatorio";
}

// --- web (PassoGuia) -> extensão, via chrome.runtime.onMessageExternal ---
// Canal totalmente separado do content script <-> service worker acima:
// mensagens externas vêm de uma página web comum (ver "externally_connectable"
// em manifest.json, restrito à origem local da web), nunca de dentro da
// extensão — usado para a web entregar o `sessaoId` DIRETAMENTE à extensão
// ao abrir /gravacao (ver ponte-web.ts), sem passar por nenhum vínculo
// clienteId<->sessaoId na API: a extensão persiste o valor recebido em
// chrome.storage.session e passa a usá-lo para todo POST/PATCH de sessão.

export const TIPO_DEFINIR_SESSAO_ATIVA = "definir-sessao-ativa";

/** web -> extensão: entrega o sessaoId da gravação aberta em /gravacao. */
export interface PedidoDefinirSessaoAtiva {
  tipo: typeof TIPO_DEFINIR_SESSAO_ATIVA;
  sessaoId: string;
}

/** extensão -> web: confirma que o sessaoId foi recebido e persistido. */
export interface RespostaDefinirSessaoAtiva {
  ok: boolean;
}
