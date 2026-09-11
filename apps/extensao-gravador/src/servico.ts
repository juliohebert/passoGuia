import { criarGravador, type Gravador } from "@passoguia/nucleo-gravador";
import type { PassoCandidato } from "@passoguia/nucleo-gravador";
import { capturarAbaVisivel, type Frame } from "./captura-tela";
import { redigirEDestacar } from "./destaque-frame";
import { injetarNaAba } from "./injecao";
import { NOME_PORTA, type MensagemCS, type Retangulo, type RelatorioFrame } from "./protocolo";
import { consolidarRedacao, type Consolidado } from "./redacao-consolidacao";
import {
  registrarFrameDoPasso,
  registrarPassoInseguro,
  registrarPassoSemFrame,
} from "./registro-prova";
import {
  TIPO_LISTAR,
  type RegistroProva,
  type RespostaListar,
} from "./tipos-diagnostico";

// Retenção só em memória para a página de diagnóstico (sem storage).
const MAX_REGISTROS = 20;
// Quanto esperar os relatórios dos demais frames antes de decidir fail-safe.
const TIMEOUT_RELATORIO_MS = 200;

interface FramePort {
  porta: chrome.runtime.Port;
  url: string;
}

interface PreAcao {
  instanteApontar: number;
  triggerFrameId: number;
  triggerUrl: string;
  triggerRelatorio: RelatorioFrame;
  alvoRect: Retangulo;
  framePromise: Promise<Frame | null>;
  relatoriosPromise: Promise<Map<number, RelatorioFrame>>;
}

interface SessaoProva {
  tabId: number;
  windowId: number;
  /** Origem (protocolo+host+porta) da aba quando a sessão iniciou. */
  origem: string;
}

function origemDe(url: string | undefined): string {
  if (!url) {
    return "";
  }
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function mesmaOrigem(url: string | undefined, origem: string): boolean {
  return origem !== "" && origemDe(url) === origem;
}

async function urlDaAba(tabId: number): Promise<string | undefined> {
  try {
    const aba = await chrome.tabs.get(tabId);
    return aba.url && aba.url !== "" ? aba.url : undefined;
  } catch {
    return undefined;
  }
}

const gravadoresPorAba = new Map<number, Gravador>();
const preAcaoPorAba = new Map<number, PreAcao>();
const registrosProva = new Map<string, RegistroProva>();
const portasPorAba = new Map<number, Map<number, FramePort>>();
const pendentesRelatorio = new Map<number, Map<number, (r: RelatorioFrame) => void>>();
// Abas onde o content script já foi injetado nesta carga da página (evita injeção dupla).
const abasInjetadas = new Set<number>();
let sessaoAtiva: SessaoProva | undefined;

function gravadorDaAba(abaId: number): Gravador {
  let gravador = gravadoresPorAba.get(abaId);
  if (!gravador) {
    gravador = criarGravador();
    gravadoresPorAba.set(abaId, gravador);
  }
  return gravador;
}

function guardarRegistro(registro: RegistroProva): void {
  registrosProva.set(registro.correlacaoId, registro);
  while (registrosProva.size > MAX_REGISTROS) {
    const antigo = registrosProva.keys().next().value;
    if (antigo === undefined) {
      break;
    }
    registrosProva.delete(antigo);
  }
}

function urlsPorFrame(tabId: number): Map<number, string> {
  const mapa = new Map<number, string>();
  const frames = portasPorAba.get(tabId);
  if (frames) {
    for (const [fid, fp] of frames) {
      mapa.set(fid, fp.url);
    }
  }
  return mapa;
}

/** Pede o relatório aos demais frames da aba e agrega com timeout fail-safe. */
function coletarRelatorios(tabId: number, exceto: number): Promise<Map<number, RelatorioFrame>> {
  const frames = portasPorAba.get(tabId);
  const alvos = frames ? [...frames.keys()].filter((f) => f !== exceto) : [];
  const resultado = new Map<number, RelatorioFrame>();
  if (alvos.length === 0) {
    return Promise.resolve(resultado);
  }
  return new Promise((resolver) => {
    let restantes = alvos.length;
    let feito = false;
    const finalizar = (): void => {
      if (feito) {
        return;
      }
      feito = true;
      pendentesRelatorio.delete(tabId);
      resolver(resultado);
    };
    const timer = setTimeout(finalizar, TIMEOUT_RELATORIO_MS);
    const pend = new Map<number, (r: RelatorioFrame) => void>();
    pendentesRelatorio.set(tabId, pend);
    for (const fid of alvos) {
      pend.set(fid, (r) => {
        resultado.set(fid, r);
        restantes -= 1;
        if (restantes <= 0) {
          clearTimeout(timer);
          finalizar();
        }
      });
      try {
        frames?.get(fid)?.porta.postMessage({ tipo: "pedir-relatorio" });
      } catch {
        restantes -= 1;
      }
    }
    if (restantes <= 0) {
      clearTimeout(timer);
      finalizar();
    }
  });
}

function iniciarGatilho(
  tabId: number,
  windowId: number,
  frameId: number,
  msg: Extract<MensagemCS, { tipo: "gatilho" }>,
): void {
  preAcaoPorAba.set(tabId, {
    instanteApontar: msg.evento.instante,
    triggerFrameId: frameId,
    triggerUrl: portasPorAba.get(tabId)?.get(frameId)?.url ?? "",
    triggerRelatorio: msg.relatorio,
    alvoRect: msg.alvoRect,
    framePromise: capturarAbaVisivel(windowId),
    relatoriosPromise: coletarRelatorios(tabId, frameId),
  });
}

function registroInseguro(
  correlacaoId: string,
  passo: PassoCandidato,
  motivos: string[],
): RegistroProva {
  return {
    correlacaoId,
    tipoAcao: passo.acao.tipo,
    seletor: passo.acao.alvo?.seletor,
    pre: null,
    redacaoIncompleta: true,
    motivos,
  };
}

async function consolidarPasso(tabId: number, passo: PassoCandidato): Promise<void> {
  if (passo.acao.tipo !== "CLIQUE") {
    return;
  }
  const pre = preAcaoPorAba.get(tabId);
  preAcaoPorAba.delete(tabId);

  const sessao = sessaoAtiva;
  if (sessao === undefined || sessao.tabId !== tabId) {
    return;
  }

  const podeCapturar = passo.capturarTela === true && passo.acao.alvo?.sensivel !== true;
  if (!podeCapturar) {
    registrarPassoSemFrame(tabId, passo, "alvo sensível ou capturarTela=false (regra do núcleo)");
    return;
  }

  const correlacaoId = crypto.randomUUID();
  const framePre =
    pre && pre.instanteApontar === passo.acao.inicio ? await pre.framePromise : null;
  registrarFrameDoPasso(correlacaoId, tabId, passo, framePre);

  const descartar = (motivos: string[]): void => {
    guardarRegistro(registroInseguro(correlacaoId, passo, motivos));
    registrarPassoInseguro(tabId, passo, motivos);
  };

  if (!pre) {
    descartar(["sem pré-ação registrada para este clique"]);
    return;
  }
  if (!framePre) {
    descartar(["screenshot PRE-AÇÃO indisponível"]);
    return;
  }

  const outros = await pre.relatoriosPromise;
  const cons: Consolidado = consolidarRedacao(
    pre.triggerFrameId,
    pre.triggerUrl,
    pre.triggerRelatorio,
    pre.alvoRect,
    outros,
    urlsPorFrame(tabId),
  );

  if (cons.redacaoIncompleta || !cons.viewportTopo || !cons.alvoRectTopo) {
    descartar(cons.motivos.length ? cons.motivos : ["consolidação de redação insuficiente"]);
    return;
  }

  const processado = await redigirEDestacar(
    framePre,
    cons.alvoRectTopo,
    cons.regioes,
    cons.viewportTopo,
  );
  if (!processado) {
    descartar(["falha ao processar o canvas de redação"]);
    return;
  }

  guardarRegistro({
    correlacaoId,
    tipoAcao: passo.acao.tipo,
    seletor: passo.acao.alvo?.seletor,
    pre: {
      dataUrl: processado.dataUrl,
      bytes: processado.bytes,
      instante: framePre.instante,
    },
    redacaoIncompleta: false,
    motivos: [],
    caixa: processado.caixaImagem,
    escala: { x: processado.escalaX, y: processado.escalaY },
  });
}

async function processarMensagem(
  tabId: number,
  frameId: number,
  msg: MensagemCS,
): Promise<void> {
  if (msg.tipo === "relatorio") {
    pendentesRelatorio.get(tabId)?.get(frameId)?.(msg.relatorio);
    return;
  }

  const sessao = sessaoAtiva;
  if (sessao === undefined || sessao.tabId !== tabId) {
    return; // a prova só roda na aba autorizada pelo clique na action
  }

  if (msg.tipo === "gatilho") {
    iniciarGatilho(tabId, sessao.windowId, frameId, msg);
  }

  const passos = gravadorDaAba(tabId).receber(msg.evento);
  for (const passo of passos) {
    await consolidarPasso(tabId, passo);
  }
}

chrome.runtime.onConnect.addListener((porta) => {
  if (porta.name !== NOME_PORTA) {
    return;
  }
  const tabId = porta.sender?.tab?.id;
  const frameId = porta.sender?.frameId;
  if (tabId === undefined || frameId === undefined) {
    return;
  }
  const url = porta.sender?.url ?? "";

  let frames = portasPorAba.get(tabId);
  if (!frames) {
    frames = new Map();
    portasPorAba.set(tabId, frames);
  }
  frames.set(frameId, { porta, url });

  porta.onDisconnect.addListener(() => {
    portasPorAba.get(tabId)?.delete(frameId);
  });
  porta.onMessage.addListener((mensagem: unknown) => {
    void processarMensagem(tabId, frameId, mensagem as MensagemCS);
  });
});

// Página de diagnóstico pede a lista de registros (imagens em memória).
chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if ((mensagem as { tipo?: string } | null)?.tipo === TIPO_LISTAR) {
    const resposta: RespostaListar = { registros: Array.from(registrosProva.values()) };
    responder(resposta);
  }
  return false;
});

/**
 * Clique no ícone: encerra a sessão da aba (toggle) OU inicia — injetando o content
 * script na aba ativa via chrome.scripting (concessão activeTab). Sem content_scripts
 * estático e sem <all_urls>: só a aba clicada é instrumentada.
 */
async function aoClicarNoIcone(tab: chrome.tabs.Tab): Promise<void> {
  if (
    typeof tab.id !== "number" ||
    tab.id < 0 ||
    typeof tab.windowId !== "number" ||
    tab.windowId < 0
  ) {
    console.warn("[extensao-gravador][sessao] aba clicada inválida (id/windowId); ignorado");
    return;
  }
  const tabId = tab.id;
  const alvo = tab.url ?? "(url desconhecida)";

  if (sessaoAtiva?.tabId === tabId) {
    sessaoAtiva = undefined;
    console.info("[extensao-gravador][sessao] encerrada; aba", tabId);
    return;
  }

  if (!abasInjetadas.has(tabId)) {
    const resultado = await injetarNaAba(tabId);
    if (!resultado.ok) {
      console.error(
        "[extensao-gravador][injecao][erro] não foi possível injetar em",
        alvo,
        "—",
        resultado.motivo ?? "motivo desconhecido",
      );
      return; // sem content script não há como capturar: sessão NÃO inicia
    }
    abasInjetadas.add(tabId);
    console.info(
      "[extensao-gravador][injecao] conteudo.js injetado em",
      alvo,
      `— ${resultado.frames} frame(s)`,
      resultado.motivo ? `(${resultado.motivo})` : "",
    );
  }

  const origem = origemDe(tab.url);
  if (origem === "") {
    console.warn(
      "[extensao-gravador][sessao] origem da sessão não pôde ser determinada; qualquer navegação encerrará a sessão",
    );
  }
  sessaoAtiva = { tabId, windowId: tab.windowId, origem };
  console.info(
    "[extensao-gravador][sessao] ativa; aba",
    tabId,
    "janela",
    tab.windowId,
    "origem",
    origem || "(desconhecida)",
  );
  console.info(
    "[extensao-gravador][diagnostico] abra manualmente:",
    chrome.runtime.getURL("diagnostico.html"),
  );
}

chrome.action.onClicked.addListener((tab) => {
  void aoClicarNoIcone(tab);
});

function limparEstadoDaAba(tabId: number): void {
  gravadoresPorAba.delete(tabId);
  preAcaoPorAba.delete(tabId);
  portasPorAba.delete(tabId);
  pendentesRelatorio.delete(tabId);
  abasInjetadas.delete(tabId);
}

function encerrarPorOrigem(tabId: number, destino: string | undefined, origem: string): void {
  sessaoAtiva = undefined;
  limparEstadoDaAba(tabId);
  console.info(
    "[extensao-gravador][sessao] encerrada — navegação saiu da origem da sessão | origem:",
    origem,
    "| destino:",
    destino ?? "(origem não confirmável — activeTab provavelmente revogado)",
  );
}

/** Campos de chrome.tabs.onUpdated realmente usados aqui. */
interface InfoNavegacao {
  status?: string;
  url?: string;
}

/**
 * Lifecycle de navegação da aba:
 *  - mesma origem: mantém a sessão, limpa o estado do documento antigo e reinjeta ao completar;
 *  - outra origem (ou não confirmável): encerra a sessão com log claro.
 */
async function aoAtualizarAba(tabId: number, changeInfo: InfoNavegacao): Promise<void> {
  const status = changeInfo.status;
  if (status !== "loading" && status !== "complete") {
    return; // pushState / título / favicon: content script segue vivo
  }

  const sessao = sessaoAtiva;
  if (sessao?.tabId !== tabId) {
    if (status === "loading") {
      limparEstadoDaAba(tabId); // higiene de aba sem sessão
    }
    return;
  }

  if (status === "loading") {
    // Sinal rápido e confiável: se o changeInfo já traz uma URL de outra origem, encerra.
    if (changeInfo.url && !mesmaOrigem(changeInfo.url, sessao.origem)) {
      encerrarPorOrigem(tabId, changeInfo.url, sessao.origem);
      return;
    }
    // Documento antigo saindo: limpa estado do doc (incl. abasInjetadas), preserva a sessão.
    limparEstadoDaAba(tabId);
    return;
  }

  // status === "complete": decide de forma autoritativa pela URL atual da aba.
  const urlAtual = await urlDaAba(tabId);
  if (!mesmaOrigem(urlAtual, sessao.origem)) {
    encerrarPorOrigem(tabId, urlAtual, sessao.origem);
    return;
  }
  if (abasInjetadas.has(tabId)) {
    return; // já injetado neste documento
  }
  const resultado = await injetarNaAba(tabId);
  if (!resultado.ok) {
    console.error(
      "[extensao-gravador][injecao][erro] reinjeção same-origin falhou em",
      urlAtual ?? "(url indisponível)",
      "—",
      resultado.motivo ?? "motivo desconhecido",
    );
    return;
  }
  abasInjetadas.add(tabId);
  console.info(
    "[extensao-gravador][injecao] conteudo.js reinjetado (navegação same-origin); aba",
    tabId,
    `— ${resultado.frames} frame(s) | ${sessao.origem}`,
  );
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  void aoAtualizarAba(tabId, changeInfo);
});

// Fechamento da aba.
chrome.tabs.onRemoved.addListener((tabId) => {
  limparEstadoDaAba(tabId);
  if (sessaoAtiva?.tabId === tabId) {
    sessaoAtiva = undefined;
  }
});
