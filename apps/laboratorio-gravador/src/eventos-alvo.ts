/**
 * Coletor de eventos vindos da página alvo cooperante (via postMessage).
 * Valida origin/source, normaliza e guarda tudo em memória (sem persistência).
 */

export interface EventoAlvo {
  tipo: string;
  t: number;
  epoch: number;
  url: string;
  x?: number;
  y?: number;
  tag?: string;
  seletor?: string;
  texto?: string;
  ariaLabel?: string;
  campo?: boolean;
  senha?: boolean;
  acionavel?: boolean;
  inputType?: string;
  tecla?: string;
}

export interface OpcoesColetor {
  origem: string;
  janelaAlvo?: Window | null;
  aoReceber?: (evento: EventoAlvo) => void;
}

export interface ColetorEventos {
  eventos(): readonly EventoAlvo[];
  /** Eventos com epoch > inicioEpoch e epoch <= fimEpoch, ordenados por epoch. */
  entre(inicioEpoch: number, fimEpoch: number): EventoAlvo[];
  parar(): void;
}

const TIPOS = new Set(["pointerdown", "click", "input", "keydown", "scroll", "url"]);

export function iniciarColetorEventos(opcoes: OpcoesColetor): ColetorEventos {
  const lista: EventoAlvo[] = [];

  function ouvir(evento: MessageEvent): void {
    if (evento.origin !== opcoes.origem) {
      return;
    }
    if (opcoes.janelaAlvo && evento.source !== opcoes.janelaAlvo) {
      return;
    }
    const dado: unknown = evento.data;
    if (!ehRegistro(dado) || dado["canal"] !== "poc0b") {
      return;
    }
    const tipo = dado["tipo"];
    if (typeof tipo !== "string" || !TIPOS.has(tipo)) {
      return;
    }
    const normalizado: EventoAlvo = {
      tipo,
      t: numero(dado["t"]) ?? 0,
      epoch: numero(dado["epoch"]) ?? Date.now(),
      url: texto(dado["url"], 300) ?? "",
      x: numero(dado["x"]),
      y: numero(dado["y"]),
      tag: texto(dado["tag"], 20),
      seletor: texto(dado["seletor"], 120),
      texto: texto(dado["texto"], 40),
      ariaLabel: texto(dado["ariaLabel"], 40),
      campo: dado["campo"] === true ? true : undefined,
      senha: dado["senha"] === true ? true : undefined,
      acionavel: dado["acionavel"] === true ? true : undefined,
      inputType: texto(dado["inputType"], 30),
      tecla: texto(dado["tecla"], 20),
    };
    lista.push(normalizado);
    opcoes.aoReceber?.(normalizado);
  }

  window.addEventListener("message", ouvir);

  return {
    eventos: () => lista,
    entre(inicioEpoch, fimEpoch) {
      return lista
        .filter((evento) => evento.epoch > inicioEpoch && evento.epoch <= fimEpoch)
        .sort((a, b) => a.epoch - b.epoch);
    },
    parar() {
      window.removeEventListener("message", ouvir);
    },
  };
}

function ehRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

function numero(valor: unknown): number | undefined {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : undefined;
}

function texto(valor: unknown, max: number): string | undefined {
  if (typeof valor !== "string") {
    return undefined;
  }
  const limpo = valor.trim();
  return limpo ? limpo.slice(0, max) : undefined;
}
