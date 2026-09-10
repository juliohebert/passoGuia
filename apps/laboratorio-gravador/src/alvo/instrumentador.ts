/**
 * Instrumentador cooperativo da página alvo.
 * Escuta interações do usuário e as envia ao capturador via window.opener.postMessage.
 * Nunca envia valores digitados (value de input/textarea/senha).
 */
import { descrever, dentroDeSenha, seletorCurto } from "./elemento";

const CANAL = "poc0b";

type TipoEvento = "pointerdown" | "click" | "input" | "keydown" | "scroll" | "url";

interface Payload {
  canal: typeof CANAL;
  tipo: TipoEvento;
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

type CorpoEvento = Omit<Payload, "canal" | "t" | "epoch" | "url">;

export function iniciarInstrumentador(): void {
  const opener = window.opener as Window | null;
  if (!opener) {
    return;
  }
  const destino: Window = opener;
  const origem = window.location.origin;

  function enviar(corpo: CorpoEvento): void {
    const payload: Payload = {
      canal: CANAL,
      t: performance.now(),
      epoch: Date.now(),
      url: window.location.href,
      ...corpo,
    };
    try {
      destino.postMessage(payload, origem);
    } catch {
      // opener fechado ou indisponível; ignora
    }
  }

  window.addEventListener(
    "pointerdown",
    (evento) => {
      enviar({
        tipo: "pointerdown",
        x: Math.round(evento.clientX),
        y: Math.round(evento.clientY),
        ...descrever(evento.target),
      });
    },
    { capture: true, passive: true },
  );

  window.addEventListener(
    "click",
    (evento) => {
      enviar({
        tipo: "click",
        x: Math.round(evento.clientX),
        y: Math.round(evento.clientY),
        ...descrever(evento.target),
      });
    },
    { capture: true },
  );

  window.addEventListener(
    "keydown",
    (evento) => {
      enviar({ tipo: "keydown", tecla: teclaSegura(evento), ...descrever(evento.target) });
    },
    { capture: true },
  );

  window.addEventListener(
    "input",
    (evento) => {
      const descricao = descrever(evento.target);
      enviar({
        tipo: "input",
        tag: descricao.tag,
        seletor: descricao.seletor,
        campo: descricao.campo,
        senha: descricao.senha,
        inputType: evento instanceof InputEvent ? evento.inputType : undefined,
      });
    },
    { capture: true },
  );

  let scrollAgendado = false;
  window.addEventListener(
    "scroll",
    (evento) => {
      if (scrollAgendado) {
        return;
      }
      scrollAgendado = true;
      requestAnimationFrame(() => {
        scrollAgendado = false;
        enviar({ tipo: "scroll", ...posicaoScroll(evento.target) });
      });
    },
    { capture: true, passive: true },
  );

  const emitirUrl = (): void => enviar({ tipo: "url" });
  window.addEventListener("hashchange", emitirUrl);
  window.addEventListener("popstate", emitirUrl);
  interceptarHistorico(emitirUrl);
}

function teclaSegura(evento: KeyboardEvent): string {
  if (dentroDeSenha(evento.target)) {
    return "•";
  }
  return evento.key.length === 1 ? "<char>" : evento.key;
}

function posicaoScroll(alvo: EventTarget | null): { x: number; y: number; seletor?: string } {
  if (alvo instanceof Element && alvo !== document.documentElement && alvo !== document.body) {
    return {
      x: Math.round(alvo.scrollLeft),
      y: Math.round(alvo.scrollTop),
      seletor: seletorCurto(alvo),
    };
  }
  return { x: Math.round(window.scrollX), y: Math.round(window.scrollY) };
}

function interceptarHistorico(aoNavegar: () => void): void {
  try {
    const push = history.pushState.bind(history);
    history.pushState = (...args: Parameters<History["pushState"]>) => {
      push(...args);
      aoNavegar();
    };
    const replace = history.replaceState.bind(history);
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      replace(...args);
      aoNavegar();
    };
  } catch {
    // history não interceptável; hashchange/popstate cobrem os casos simples
  }
}
