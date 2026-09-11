import type { EventoCapturado, TipoEventoBruto } from "@passoguia/nucleo-gravador";
import { SELETOR_ACIONAVEL } from "@passoguia/nucleo-gravador";
import { criarDescricaoAlvo } from "./descritor-alvo";
import { instanteComum } from "./instante";
import { enviarMensagem, iniciarTransporte } from "./transporte";
import type {
  IframeVisivel,
  MensagemCS,
  Retangulo,
  RelatorioFrame,
  ViewportCss,
} from "./protocolo";

/**
 * Content script — roda em TODO frame (all_frames). Reporta ao service worker a
 * geometria dos campos editáveis visíveis DESTE frame (nunca value/textContent),
 * percorrendo shadow roots ABERTOS. Shadow roots fechados não são acessados —
 * apenas sinalizados como "possíveis".
 */
function viewportAtual(): ViewportCss {
  return { largura: window.innerWidth, altura: window.innerHeight };
}

function retanguloDe(el: Element): Retangulo {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, largura: r.width, altura: r.height };
}

function visivel(r: DOMRect, vp: ViewportCss): boolean {
  return (
    r.width > 0 &&
    r.height > 0 &&
    r.bottom > 0 &&
    r.right > 0 &&
    r.top < vp.altura &&
    r.left < vp.largura
  );
}

function ehCampoEditavel(el: Element): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

/** Heurística de shadow root FECHADO: custom element sem shadow aberto, sem light DOM, mas visível. */
function possivelShadowFechado(el: Element): boolean {
  if (!el.tagName.includes("-")) {
    return false;
  }
  if (el.shadowRoot || el.childElementCount > 0) {
    return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 8 && r.height > 8;
}

interface Acumulador {
  campos: Retangulo[];
  iframes: IframeVisivel[];
  shadowFechadoPossivel: boolean;
}

function varrer(raiz: ParentNode, vp: ViewportCss, acc: Acumulador): void {
  for (const el of raiz.querySelectorAll("*")) {
    if (ehCampoEditavel(el)) {
      const r = el.getBoundingClientRect();
      if (visivel(r, vp)) {
        acc.campos.push({ x: r.x, y: r.y, largura: r.width, altura: r.height });
      }
    }
    if (el instanceof HTMLIFrameElement || el instanceof HTMLFrameElement) {
      const r = el.getBoundingClientRect();
      if (visivel(r, vp)) {
        acc.iframes.push({
          rect: { x: r.x, y: r.y, largura: r.width, altura: r.height },
          src: el.src,
        });
      }
    }
    if (el.shadowRoot) {
      varrer(el.shadowRoot, vp, acc); // apenas shadow roots ABERTOS
    } else if (possivelShadowFechado(el)) {
      acc.shadowFechadoPossivel = true;
    }
  }
}

function montarRelatorio(): RelatorioFrame {
  const vp = viewportAtual();
  const acc: Acumulador = { campos: [], iframes: [], shadowFechadoPossivel: false };
  varrer(document, vp, acc);
  return {
    viewport: vp,
    campos: acc.campos,
    iframes: acc.iframes,
    shadowFechadoPossivel: acc.shadowFechadoPossivel,
  };
}

function montar(tipo: TipoEventoBruto, evento: PointerEvent | MouseEvent): MensagemCS {
  const alvoEl = evento.target instanceof Element ? evento.target : undefined;
  const descricao = alvoEl ? criarDescricaoAlvo(alvoEl) : undefined;

  const capturado: EventoCapturado = {
    tipo,
    instante: instanteComum(evento),
    url: location.href,
    posicao: { x: Math.round(evento.clientX), y: Math.round(evento.clientY) },
    ...(descricao ? { alvo: descricao } : {}),
  };

  if (tipo === "apontar" && alvoEl && descricao?.acionavel === true) {
    const acionavel = alvoEl.closest(SELETOR_ACIONAVEL) ?? alvoEl;
    return {
      tipo: "gatilho",
      evento: capturado,
      alvoRect: retanguloDe(acionavel),
      relatorio: montarRelatorio(),
    };
  }
  return { tipo: "evento", evento: capturado };
}

declare global {
  interface Window {
    __passoguiaGravadorAtivo?: boolean;
  }
}

// Injeção via chrome.scripting pode repetir na mesma página/sessão:
// só liga porta e listeners uma vez por documento.
if (!window.__passoguiaGravadorAtivo) {
  window.__passoguiaGravadorAtivo = true;

  iniciarTransporte(montarRelatorio);

  window.addEventListener(
    "pointerdown",
    (evento) => {
      enviarMensagem(montar("apontar", evento));
    },
    { capture: true, passive: true },
  );

  window.addEventListener(
    "click",
    (evento) => {
      enviarMensagem(montar("clicar", evento));
    },
    { capture: true },
  );
}
