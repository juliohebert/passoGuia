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
import { instanteComum } from "./instante";
import { metadadosDoCampo } from "./metadados-campo";
import { iniciarObservacaoPosAcao } from "./observacao-pos-acao";
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

  const acionavelEl = resolverElementoAcionavel(alvoEl);

  if (tipo === "apontar" && alvoEl && descricao?.acionavel === true) {
    const acionavel = acionavelEl ?? alvoEl;
    const decisaoUiTransitoria = abreUiTransitoria(alvoEl, acionavelEl);

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
      const mensagem = montar("apontar", evento);
      enviarMensagem(mensagem);
      if (mensagem.tipo === "gatilho") {
        iniciarObservacaoPosAcao(mensagem.evento.instante, (instanteApontar) => {
          enviarMensagem({ tipo: "mudanca-pos-acao", instanteApontar });
        });
      }
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
