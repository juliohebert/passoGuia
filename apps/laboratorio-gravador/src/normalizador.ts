/**
 * Normaliza eventos técnicos da página alvo em ações relevantes.
 * Nunca guarda valores digitados (o EventoAlvo já não os traz).
 */
import type { EventoAlvo } from "./eventos-alvo";

export type TipoAcao = "CLICK" | "PREENCHIMENTO" | "SCROLL" | "NAVEGACAO";

export interface AcaoNormalizada {
  tipo: TipoAcao;
  tag?: string;
  seletor?: string;
  texto?: string;
  ariaLabel?: string;
  /** Alvo é campo de entrada editável (input/textarea/select/contenteditable). */
  campo?: boolean;
  /** Alvo é input[type=password]. */
  senha?: boolean;
  /** Alvo é acionável (button/a/role=button/…). */
  acionavel?: boolean;
  x?: number;
  y?: number;
  url: string;
  inicio: number;
  fim: number;
}

export interface Normalizador {
  aoEvento(evento: EventoAlvo): void;
  /** Fecha qualquer ação pendente (usar ao encerrar a sessão). */
  parar(): void;
}

type Familia = "click" | "preenchimento" | "scroll" | "navegacao";

const FAMILIA: Record<string, Familia> = {
  pointerdown: "click",
  click: "click",
  keydown: "preenchimento",
  input: "preenchimento",
  scroll: "scroll",
  url: "navegacao",
};

const TIPO_ACAO: Record<Familia, TipoAcao> = {
  click: "CLICK",
  preenchimento: "PREENCHIMENTO",
  scroll: "SCROLL",
  navegacao: "NAVEGACAO",
};

// Inatividade que fecha a ação pendente, por família.
const ATRASO_FLUSH_MS: Record<Familia, number> = {
  click: 400,
  preenchimento: 1000,
  scroll: 500,
  navegacao: 250,
};

interface Pendente {
  familia: Familia;
  seletor?: string;
  tag?: string;
  texto?: string;
  ariaLabel?: string;
  campo?: boolean;
  senha?: boolean;
  acionavel?: boolean;
  x?: number;
  y?: number;
  url: string;
  inicio: number;
  fim: number;
}

export function criarNormalizador(aoAcao: (acao: AcaoNormalizada) => void): Normalizador {
  let pendente: Pendente | undefined;
  let timer: number | undefined;

  function limparTimer(): void {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  }

  function flush(): void {
    limparTimer();
    if (!pendente) {
      return;
    }
    const p = pendente;
    pendente = undefined;
    const acao: AcaoNormalizada = {
      tipo: TIPO_ACAO[p.familia],
      url: p.url,
      inicio: p.inicio,
      fim: p.fim,
      ...(p.tag ? { tag: p.tag } : {}),
      ...(p.seletor ? { seletor: p.seletor } : {}),
      ...(p.texto ? { texto: p.texto } : {}),
      ...(p.ariaLabel ? { ariaLabel: p.ariaLabel } : {}),
      ...(p.campo ? { campo: true } : {}),
      ...(p.senha ? { senha: true } : {}),
      ...(p.acionavel ? { acionavel: true } : {}),
      ...(p.x !== undefined ? { x: p.x } : {}),
      ...(p.y !== undefined ? { y: p.y } : {}),
    };
    aoAcao(acao);
  }

  function trocaDeContexto(familia: Familia, evento: EventoAlvo): boolean {
    if (!pendente) {
      return false;
    }
    if (pendente.familia !== familia) {
      return true;
    }
    // preenchimento/scroll: mudou o campo/elemento -> nova ação
    return (
      (familia === "preenchimento" || familia === "scroll") &&
      pendente.seletor !== evento.seletor
    );
  }

  function aoEvento(evento: EventoAlvo): void {
    const familia = FAMILIA[evento.tipo];
    if (!familia) {
      return;
    }
    if (trocaDeContexto(familia, evento)) {
      flush();
    }

    if (!pendente) {
      pendente = {
        familia,
        seletor: evento.seletor,
        tag: evento.tag,
        texto: evento.texto,
        ariaLabel: evento.ariaLabel,
        campo: evento.campo,
        senha: evento.senha,
        acionavel: evento.acionavel,
        x: evento.x,
        y: evento.y,
        url: evento.url,
        inicio: evento.epoch,
        fim: evento.epoch,
      };
    } else {
      pendente.fim = evento.epoch;
      pendente.url = evento.url;
      if (evento.x !== undefined) pendente.x = evento.x;
      if (evento.y !== undefined) pendente.y = evento.y;
      if (evento.tag && !pendente.tag) pendente.tag = evento.tag;
      if (evento.texto && !pendente.texto) pendente.texto = evento.texto;
      if (evento.ariaLabel && !pendente.ariaLabel) pendente.ariaLabel = evento.ariaLabel;
      if (evento.campo) pendente.campo = true;
      if (evento.senha) pendente.senha = true;
      if (evento.acionavel) pendente.acionavel = true;
    }

    // CLICK fecha assim que chega o "click" (pointerdown + click => 1 ação).
    if (familia === "click" && evento.tipo === "click") {
      flush();
      return;
    }

    limparTimer();
    timer = window.setTimeout(flush, ATRASO_FLUSH_MS[familia]);
  }

  return {
    aoEvento,
    parar: flush,
  };
}
