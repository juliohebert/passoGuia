import type { EventoCapturado, TipoEventoBruto } from "@passoguia/nucleo-gravador";
import { classificarSensibilidade } from "@passoguia/nucleo-gravador";
import { criarDescricaoAlvo } from "./descritor-alvo";
import { ehCampoEditavel } from "./descoberta-campo";
import {
  regiaoSensivelDoElemento,
  regioesDeColunasSensiveis,
  regioesDeListaDefinicao,
  regioesDeTextoRotulado,
} from "./descoberta-texto-sensivel";
import { abreUiTransitoria } from "./deteccao-ui-transitoria";
import { DIAGNOSTICO_ATIVO } from "./diagnostico-flag";
import { instanteComum } from "./instante";
import { metadadosDoCampo } from "./metadados-campo";
import { resolverElementoAcionavel } from "./resolucao-acionavel";
import { enviarMensagem, iniciarTransporte } from "./transporte";
import { retanguloSeVisivel } from "./visibilidade-elemento";
import type {
  IframeVisivel,
  MensagemCS,
  Retangulo,
  RelatorioFrame,
  SugestaoRegiao,
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
  sugestoes: SugestaoRegiao[];
  iframes: IframeVisivel[];
  shadowFechadoPossivel: boolean;
}

function varrer(raiz: ParentNode, vp: ViewportCss, acc: Acumulador): void {
  // Texto estático sensível (não é campo de formulário): colunas de tabela por
  // cabeçalho, pares <dt>/<dd> e aria-label/aria-labelledby — tudo vira
  // SUGESTÃO (nunca é desenhado automaticamente sobre o screenshot).
  acc.sugestoes.push(
    ...regioesDeColunasSensiveis(raiz, vp),
    ...regioesDeListaDefinicao(raiz, vp),
    ...regioesDeTextoRotulado(raiz, vp),
  );

  for (const el of raiz.querySelectorAll("*")) {
    // Política em sensibilidade-campo.ts do núcleo — campos de busca/filtro,
    // selects comuns etc. não geram sugestão nenhuma.
    if (ehCampoEditavel(el)) {
      const classificacao = classificarSensibilidade(metadadosDoCampo(el));
      if (classificacao) {
        const r = retanguloSeVisivel(el, vp);
        if (r) {
          acc.sugestoes.push({ retangulo: r, ...classificacao });
        }
      }
    }
    if (el instanceof HTMLIFrameElement || el instanceof HTMLFrameElement) {
      const r = retanguloSeVisivel(el, vp);
      if (r) {
        acc.iframes.push({ rect: r, src: el.src });
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
  const acc: Acumulador = { sugestoes: [], iframes: [], shadowFechadoPossivel: false };
  varrer(document, vp, acc);
  return {
    viewport: vp,
    sugestoes: acc.sugestoes,
    iframes: acc.iframes,
    shadowFechadoPossivel: acc.shadowFechadoPossivel,
    instante: Date.now(),
  };
}

// DIAGNOSTICO TEMP (investigação "cliques que não viram passo") ---------------
// Loga, para todo pointerdown/click, o elemento clicado, o elemento acionável
// resolvido (resolverElementoAcionavel) e se este evento vai gerar PRE-AÇÃO.
// Atrás de DIAGNOSTICO_ATIVO (desligado por padrão) — não polui produção.
function descreverEl(el: Element | undefined): string {
  if (!el) return "(nenhum)";
  const id = el.id ? `#${el.id}` : "";
  const cls =
    typeof el.className === "string" && el.className
      ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
      : "";
  const role = el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : "";
  return `${el.tagName.toLowerCase()}${id}${cls}${role}`;
}

// DIAGNOSTICO TEMP (investigação "select/dropdown real do QuarkClinic não vira POST"):
// loga, para todo gatilho de clique, exatamente os marcadores que abreUiTransitoria()
// usa para decidir — assim dá pra ver, num select/dropdown REAL, qual sinal falta
// (tag/role/aria-haspopup/aria-expanded/classes) sem precisar adivinhar o markup.
// Atrás de DIAGNOSTICO_ATIVO — remover junto com o restante do diagnóstico.
function logDiagUiTransitoria(
  diagId: string,
  alvoEl: Element,
  acionavelEl: Element | null,
  decisao: boolean,
): void {
  if (!DIAGNOSTICO_ATIVO) {
    return;
  }
  const descreverMarcadores = (el: Element | null) =>
    el
      ? {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role"),
          ariaHaspopup: el.getAttribute("aria-haspopup"),
          ariaExpanded: el.getAttribute("aria-expanded"),
          ariaControls: el.getAttribute("aria-controls"),
          classes: typeof el.className === "string" ? el.className : undefined,
        }
      : null;
  console.info("[diag][conteudo] abreUiTransitoria", {
    diagId,
    alvoClicado: descreverMarcadores(alvoEl),
    elementoAcionavelResolvido: descreverMarcadores(acionavelEl),
    abreUiTransitoria: decisao,
  });
}
// --------------------------------------------------------------------------

function logDiagClique(
  diagId: string,
  tipo: TipoEventoBruto,
  alvoEl: Element | undefined,
  acionavelEl: Element | null | undefined,
  descricao: ReturnType<typeof criarDescricaoAlvo> | undefined,
  gerouGatilho: boolean,
): void {
  if (!DIAGNOSTICO_ATIVO) {
    return;
  }
  const descartadoPorIrrelevancia = tipo === "clicar" && descricao?.acionavel !== true;
  console.info("[diag][conteudo]", {
    diagId,
    tipo,
    elementoClicado: descreverEl(alvoEl),
    elementoAcionavelResolvido: descreverEl(acionavelEl ?? undefined),
    acionavel: descricao?.acionavel === true,
    campoEditavel: descricao?.campoEditavel === true,
    sensivel: descricao?.sensivel === true,
    descartado: descartadoPorIrrelevancia,
    motivo: descartadoPorIrrelevancia
      ? "alvo não resolve a nenhum elemento acionável (estrutural ou heurística li/div) — não vira PassoCandidato"
      : undefined,
    gerouGatilho,
  });
}
// --------------------------------------------------------------------------

function montar(tipo: TipoEventoBruto, evento: PointerEvent | MouseEvent): MensagemCS {
  const alvoEl = evento.target instanceof Element ? evento.target : undefined;
  const descricao = alvoEl ? criarDescricaoAlvo(alvoEl) : undefined;
  const diagId = crypto.randomUUID(); // DIAGNOSTICO TEMP

  const capturado: EventoCapturado = {
    tipo,
    instante: instanteComum(evento),
    url: location.href,
    posicao: { x: Math.round(evento.clientX), y: Math.round(evento.clientY) },
    ...(descricao ? { alvo: descricao } : {}),
  };

  const acionavelEl = resolverElementoAcionavel(alvoEl);

  if (tipo === "apontar" && alvoEl && descricao?.acionavel === true) {
    const acionavel = acionavelEl ?? alvoEl;
    const decisaoUiTransitoria = abreUiTransitoria(alvoEl, acionavelEl);
    logDiagClique(diagId, tipo, alvoEl, acionavelEl, descricao, true); // DIAGNOSTICO TEMP
    logDiagUiTransitoria(diagId, alvoEl, acionavelEl, decisaoUiTransitoria); // DIAGNOSTICO TEMP

    const relatorio = montarRelatorio();
    if (descricao.sensivel === true) {
      // O ALVO do clique é sensível (ex.: linha/item de lista com aria-label
      // contendo o nome do paciente): nunca sugere o container inteiro quando
      // um pedaço menor já identifica o dado — soma à MESMA lista de
      // sugestões (síncrona, já confiável) as região(ões) mais justas
      // encontradas dentro dele (ver regiaoSensivelDoElemento).
      const classificacaoAlvo = classificarSensibilidade(metadadosDoCampo(acionavel));
      relatorio.sugestoes = [
        ...relatorio.sugestoes,
        ...regiaoSensivelDoElemento(acionavel, relatorio.viewport, classificacaoAlvo),
      ];
    }

    return {
      tipo: "gatilho",
      evento: capturado,
      alvoRect: retanguloDe(acionavel),
      relatorio,
      abreUiTransitoria: decisaoUiTransitoria,
      diagId,
    };
  }
  logDiagClique(diagId, tipo, alvoEl, acionavelEl, descricao, false); // DIAGNOSTICO TEMP
  return { tipo: "evento", evento: capturado, diagId };
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
      // DIAGNOSTICO TEMP: confirma que o listener de captura disparou (categoria 3).
      if (DIAGNOSTICO_ATIVO) {
        console.info(
          "[diag][conteudo] pointerdown capturado",
          descreverEl(evento.target instanceof Element ? evento.target : undefined),
        );
      }
      enviarMensagem(montar("apontar", evento));
    },
    { capture: true, passive: true },
  );

  window.addEventListener(
    "click",
    (evento) => {
      // DIAGNOSTICO TEMP: confirma que o listener de captura disparou (categoria 3).
      if (DIAGNOSTICO_ATIVO) {
        console.info(
          "[diag][conteudo] click capturado",
          descreverEl(evento.target instanceof Element ? evento.target : undefined),
        );
      }
      enviarMensagem(montar("clicar", evento));
    },
    { capture: true },
  );
}
