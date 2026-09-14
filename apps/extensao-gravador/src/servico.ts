import { criarGravador, type Gravador } from "@passoguia/nucleo-gravador";
import type { PassoCandidato } from "@passoguia/nucleo-gravador";
import {
  capturarFrameAtual,
  iniciarCapturaStream,
  pararCapturaStream,
  registrarErroFatalDaCaptura,
  restaurarCapturaStream,
  type Frame,
} from "./captura-stream";
import { descricaoDoPasso } from "./descricao-passo";
import { prepararCaptura, type FrameProcessado } from "./destaque-frame";
import { atualizarImagemPasso, atualizarOrigemDaSessao, enviarPasso } from "./envio-api";
import { marcarIconeAguardandoPermissao, marcarIconeAtivo, marcarIconeInativo } from "./icone-acao";
import { injetarNaAba } from "./injecao";
import { decidirNavegacao } from "./mesmo-site";
import { solicitarPermissaoParaNavegacoes } from "./permissao-site";
import {
  adicionarPreAcao,
  localizarEConsumirPreAcao,
  podarPreAcoes,
} from "./pre-acoes";
import { iniciarPonteWeb } from "./ponte-web";
import {
  aguardarPostAposNavegacao,
  type MotivoPost,
  registrarNavegacaoIniciada,
  sinalizarMudancaPosAcao,
  sinalizarNavegacaoParaPost,
} from "./post-acao";
import { NOME_PORTA, type MensagemCS, type Retangulo, type RelatorioFrame } from "./protocolo";
import { consolidarRedacao, type Consolidado } from "./redacao-consolidacao";
import { selecionarCaptura } from "./selecao-captura";
import {
  lerSessaoAtivaPersistida,
  limparSessaoAtivaPersistida,
  persistirSessaoAtiva,
} from "./sessao-persistida";
import { tituloDoPasso } from "./titulo-passo";

// Quanto esperar os relatórios dos demais frames antes de decidir fail-safe.
const TIMEOUT_RELATORIO_MS = 200;
// Pequena estabilização antes do screenshot POST — dá tempo do dropdown/menu/
// modal terminar de abrir (animação/render) antes de capturar a aba.
const ATRASO_ESTABILIZACAO_POS_MS = 180;
// Pequena margem depois do documento estar pronto para que o primeiro frame
// do tabCapture represente a tela de destino, sem impor um atraso grande a
// ações que não navegam.
const ATRASO_DEBOUNCE_NAVEGACAO_MS = 60;
// Máximo de PRE-AÇÕES pendentes por aba (buffer, não mais um slot único —
// ver PreAcao/preAcoesPorAba). Cliques rápidos consecutivos ficam todos em
// voo ao mesmo tempo (pointerdown dispara a captura antes do clique fechar a
// ação); um único slot sobrescrito perdia a PRE-AÇÃO de um clique quando o
// próximo pointerdown chegava antes da consolidação do anterior.
const MAX_PRE_PENDENTES_POR_ABA = 8;
// Poda por idade: uma PRE-AÇÃO nunca reclamada por tempo maior que isso é
// lixo (clique nunca fechou uma ação) — descartada para não vazar memória.
const TTL_PRE_PENDENTE_MS = 8000;
interface FramePort {
  porta: chrome.runtime.Port;
  url: string;
}

/** Screenshot + relatórios coletados DEPOIS da estabilização, para ações que abrem UI transitória. */
interface CapturaPos {
  frame: Frame | null;
  triggerRelatorio: RelatorioFrame | undefined;
  outros: Map<number, RelatorioFrame>;
}

interface PreAcao {
  criadoEm: number;
  instanteApontar: number;
  triggerFrameId: number;
  triggerUrl: string;
  triggerRelatorio: RelatorioFrame;
  alvoRect: Retangulo;
  framePromise: Promise<Frame | null>;
  relatoriosPromise: Promise<Map<number, RelatorioFrame>>;
  abreUiTransitoria: boolean;
  postNavegacaoPromise: Promise<MotivoPost> | undefined;
}

interface SessaoProva {
  tabId: number;
  windowId: number;
  /**
   * Sites (origens representativas) já autorizados NESTA gravação — uma
   * gravação pode autorizar vários sistemas ao longo do tempo (ver
   * mesmo-site.ts: `decidirNavegacao`/`sitePermitidoNaLista` decidem por
   * SITE — domínio-base via Public Suffix List —, não por origem exata;
   * subdomínios de qualquer site desta lista continuam vinculados à mesma
   * gravação).
   */
  sitesAutorizados: string[];
  /** Mantido para compatibilidade do estado persistido entre reinícios. */
  pausada: boolean;
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

async function urlDaAba(tabId: number): Promise<string | undefined> {
  try {
    const aba = await chrome.tabs.get(tabId);
    return aba.url && aba.url !== "" ? aba.url : undefined;
  } catch {
    return undefined;
  }
}

const gravadoresPorAba = new Map<number, Gravador>();
/**
 * BUFFER (não mais um slot único) de PRE-AÇÕES em voo por aba — associa cada
 * captura PRE ao seu próprio gatilho/correlação (instanteApontar), nunca a
 * "a mais recente da aba". Um clique consome (remove) só a SUA entrada
 * (match exato por instante), preservando as demais em voo. Ver
 * localizarEConsumirPreAcao / podarPreAcoes.
 */
const preAcoesPorAba = new Map<number, PreAcao[]>();
const portasPorAba = new Map<number, Map<number, FramePort>>();
const pendentesRelatorio = new Map<number, Map<number, (r: RelatorioFrame) => void>>();
// Abas onde o content script já foi injetado nesta carga da página (evita injeção dupla).
const abasInjetadas = new Set<number>();
let sessaoAtiva: SessaoProva | undefined;

registrarErroFatalDaCaptura((motivo) => {
  const sessao = sessaoAtiva;
  if (!sessao) {
    return;
  }
  console.error("[extensao-gravador][captura-stream][erro] captura encerrada", motivo);
  sessaoAtiva = undefined;
  void marcarIconeInativo(sessao.tabId);
  void limparSessaoAtivaPersistida();
  void pararCapturaStream();
});

/**
 * `sessaoAtiva` vive só nesta variável em memória — o MV3 mata o service
 * worker por inatividade (ou o navegador o suspende) e ZERA isso, mesmo com
 * uma gravação em andamento (ver sessao-persistida.ts). Restaura de
 * `chrome.storage.session` assim que o módulo carrega (todo boot do service
 * worker reexecuta o topo do arquivo), ANTES de qualquer evento real ser
 * processado — os pontos que leem `sessaoAtiva` para decidir algo
 * (`processarMensagem`, `aoAtualizarAba`, `aoClicarNoIcone`) esperam esta
 * promise primeiro, então nunca correm à frente da restauração. Reflete o
 * ícone laranja de novo (o Chrome costuma manter isso por conta própria,
 * mas nunca por garantia — restaurado aqui de qualquer forma).
 */
async function restaurarSessaoAtiva(): Promise<void> {
  const persistida = await lerSessaoAtivaPersistida();
  if (!persistida) {
    return;
  }
  sessaoAtiva = {
    tabId: persistida.tabId,
    windowId: persistida.windowId,
    sitesAutorizados: persistida.sitesAutorizados,
    pausada: persistida.pausada,
  };
  const streamRestaurada = await restaurarCapturaStream();
  sessaoAtiva.pausada = persistida.pausada || !streamRestaurada;
  void (sessaoAtiva.pausada ? marcarIconeAguardandoPermissao(persistida.tabId) : marcarIconeAtivo(persistida.tabId));
  console.info(
    "[extensao-gravador][sessao] restaurada após reinício/suspensão do service worker; aba",
    persistida.tabId,
    sessaoAtiva.pausada ? "(pausada; stream indisponível)" : "(stream restaurada)",
    persistida.sitesAutorizados.join(", ") || "(nenhum ainda)",
  );
}

const restauracaoDaSessaoAtiva: Promise<void> = restaurarSessaoAtiva();

function gravadorDaAba(abaId: number): Gravador {
  let gravador = gravadoresPorAba.get(abaId);
  if (!gravador) {
    gravador = criarGravador();
    gravadoresPorAba.set(abaId, gravador);
  }
  return gravador;
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

function aguardar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/**
 * Pede o relatório aos frames da aba e agrega com timeout fail-safe.
 * `exceto` omitido pede a TODOS os frames (usado no POST, que — diferente do
 * PRE — não tem um relatório síncrono do frame de disparo).
 */
function coletarRelatorios(
  tabId: number,
  exceto?: number,
): Promise<Map<number, RelatorioFrame>> {
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

/**
 * Screenshot POST: espera a estabilização e então captura a aba + pede o
 * relatório a TODOS os frames (incluindo o de disparo, que para o PRE já vem
 * embutido de forma síncrona no "gatilho", mas para o POST precisa ser
 * pedido como os demais — o estado do DOM pode ter mudado).
 */
async function capturarPos(
  tabId: number,
  triggerFrameId: number,
  atrasoMs = ATRASO_ESTABILIZACAO_POS_MS,
): Promise<CapturaPos> {
  if (atrasoMs > 0) {
    await aguardar(atrasoMs);
  }
  const [frame, relatorios] = await Promise.all([
    capturarFrameAtual(),
    coletarRelatorios(tabId),
  ]);
  return {
    frame,
    // Após uma navegação o frame que disparou o clique pode receber outro id;
    // o relatório do topo ainda representa a tela POST e é um fallback seguro.
    triggerRelatorio: relatorios.get(triggerFrameId) ?? relatorios.get(0),
    outros: relatorios,
  };
}

function iniciarGatilho(
  tabId: number,
  frameId: number,
  msg: Extract<MensagemCS, { tipo: "gatilho" }>,
): void {
  const instanteApontar = msg.evento.instante;
  const criadoEm = Date.now();
  const nova: PreAcao = {
    criadoEm,
    instanteApontar,
    triggerFrameId: frameId,
    triggerUrl: portasPorAba.get(tabId)?.get(frameId)?.url ?? "",
    triggerRelatorio: msg.relatorio,
    alvoRect: msg.alvoRect,
    framePromise: capturarFrameAtual(),
    relatoriosPromise: coletarRelatorios(tabId, frameId),
    abreUiTransitoria: msg.abreUiTransitoria,
    postNavegacaoPromise: aguardarPostAposNavegacao(tabId, instanteApontar),
  };
  adicionarPreAcao(preAcoesPorAba, tabId, nova, MAX_PRE_PENDENTES_POR_ABA, TTL_PRE_PENDENTE_MS);
}

/**
 * Campos da ação já normalizados/protegidos, comuns aos dois envios possíveis
 * (com ou sem imagem). Nunca inclui value/texto digitado/evento bruto.
 */
function payloadBase(
  correlacaoId: string,
  passo: PassoCandidato,
): Omit<
  Parameters<typeof enviarPasso>[0],
  "redacaoIncompleta" | "revisaoPrivacidadeNecessaria" | "ocorridoEm"
> {
  return {
    correlacaoId,
    tipoAcao: passo.acao.tipo,
    titulo: tituloDoPasso(passo.acao),
    descricao: descricaoDoPasso(passo.acao),
    ...(passo.acao.alvo?.seletor ? { seletor: passo.acao.alvo.seletor } : {}),
    ...(passo.acao.url ? { urlOrigem: passo.acao.url } : {}),
  };
}

/** Consolida a redação de UM momento (PRE ou POST) — geometria pura, sem tocar no canvas. */
function processarCaptura(
  triggerFrameId: number,
  triggerUrl: string,
  triggerRelatorio: RelatorioFrame,
  alvoRect: Retangulo | undefined,
  outros: Map<number, RelatorioFrame>,
  tabId: number,
): { consolidado: Consolidado; redacaoIncompleta: boolean } {
  const consolidado = consolidarRedacao(
    triggerFrameId,
    triggerUrl,
    triggerRelatorio,
    alvoRect,
    outros,
    urlsPorFrame(tabId),
  );
  return { consolidado, redacaoIncompleta: consolidado.redacaoIncompleta };
}

async function consolidarPasso(
  tabId: number,
  passo: PassoCandidato,
): Promise<void> {
  if (passo.acao.tipo !== "CLIQUE") {
    return;
  }

  const sessao = sessaoAtiva;
  if (sessao === undefined || sessao.tabId !== tabId) {
    return;
  }

  // Chegada do click (a ação CLIQUE só fecha quando o "clicar" chega —
  // ver normalizador.ts): associa a captura PRE ao GATILHO que a originou
  // (match exato por instanteApontar), nunca "a mais recente da aba" — um
  // buffer, não mais um slot único, para cliques rápidos consecutivos não se
  // atropelarem (ver localizarEConsumirPreAcao).
  podarPreAcoes(preAcoesPorAba, tabId, MAX_PRE_PENDENTES_POR_ABA, TTL_PRE_PENDENTE_MS);
  const pre = localizarEConsumirPreAcao(preAcoesPorAba, tabId, passo.acao.inicio);
  const correlacaoId = crypto.randomUUID();

  // NOVA POLÍTICA: privacidade nunca mais descarta a imagem inteira. Um passo só
  // fica sem screenshot por razão de INFRAESTRUTURA (sem PRE-AÇÃO / sem frame /
  // falha de canvas) — nunca porque a detecção automática de regiões sensíveis
  // não teve 100% de certeza. Nesse caso a imagem VAI, marcada com
  // revisaoPrivacidadeNecessaria=true.
  const enviarSemImagem = (): void => {
    void enviarPasso({
      ...payloadBase(correlacaoId, passo),
      redacaoIncompleta: true,
      revisaoPrivacidadeNecessaria: false,
      ocorridoEm: passo.acao.fim,
    });
  };

  if (!pre) {
    enviarSemImagem();
    return;
  }

  // localizarEConsumirPreAcao já garante instanteApontar === passo.acao.inicio
  // (match exato) — não inicia uma segunda captura: só espera a captura PRE
  // existente, que pode estar aguardando a fila global do Chrome. Fallback sem
  // imagem só acontece quando a captura realmente falha.
  const framePre = await pre.framePromise;

  if (!framePre) {
    enviarSemImagem();
    return;
  }

  const outros = await pre.relatoriosPromise;
  const resultadoPre = processarCaptura(
    pre.triggerFrameId,
    pre.triggerUrl,
    pre.triggerRelatorio,
    pre.alvoRect,
    outros,
    tabId,
  );

  if (resultadoPre.redacaoIncompleta || !resultadoPre.consolidado.viewportTopo) {
    // Só acontece quando nem o frame de topo respondeu: sem viewport não há
    // como escalar NADA com segurança — este é o único caso "sem imagem"
    // depois de termos um screenshot em mãos.
    enviarSemImagem();
    return;
  }

  const processadoPre = await prepararCaptura(
    framePre,
    resultadoPre.consolidado.alvoRectTopo,
    resultadoPre.consolidado.sugestoes,
    resultadoPre.consolidado.viewportTopo,
  );
  if (!processadoPre) {
    // Falha real ao decodificar a imagem — não dá pra produzir metadados com segurança.
    enviarSemImagem();
    return;
  }

  const revisaoPre = resultadoPre.consolidado.revisaoNecessaria || processadoPre.sugestoesMascara.length > 0;
  await enviarPasso({
    ...payloadBase(correlacaoId, passo),
    imagemRedigida: processadoPre.dataUrl,
    redacaoIncompleta: false,
    revisaoPrivacidadeNecessaria: revisaoPre,
    sugestoesMascara: processadoPre.sugestoesMascara,
    ocorridoEm: passo.acao.fim,
  });

  // Padrão: PRE. Só troca para POST quando o alvo sinalizou UI transitória
  // (select/dropdown/menu/autocomplete/modal/popover) E a captura POST (com a
  // MESMA redação de privacidade) foi produzida com sucesso — nunca ao
  // contrário: um POST que falhou nunca derruba o PRE que já temos em mãos.
  let escolhido: {
    frame: Frame;
    consolidado: Consolidado;
    processado: FrameProcessado;
    origem: "pre" | "pos";
  } = {
    frame: framePre,
    consolidado: resultadoPre.consolidado,
    processado: processadoPre,
    origem: "pre",
  };

  const motivoPost = pre.postNavegacaoPromise
    ? await pre.postNavegacaoPromise
    : false;
  const navegouDepoisDaAcao = motivoPost === "navegacao";
  const houveMudancaPosAcao = motivoPost === "mudanca";
  const posPromise = navegouDepoisDaAcao || houveMudancaPosAcao
    ? capturarPos(tabId, pre.triggerFrameId, 0)
    : undefined;

  if (posPromise) {
    const pos = await posPromise;
    if (pos.frame && pos.triggerRelatorio) {
      const resultadoPos = processarCaptura(
        pre.triggerFrameId,
        navegouDepoisDaAcao ? "" : pre.triggerUrl,
        pos.triggerRelatorio,
        navegouDepoisDaAcao ? undefined : pre.alvoRect,
        pos.outros,
        tabId,
      );
      if (!resultadoPos.redacaoIncompleta && resultadoPos.consolidado.viewportTopo) {
        const processadoPos = await prepararCaptura(
          pos.frame,
          resultadoPos.consolidado.alvoRectTopo,
          resultadoPos.consolidado.sugestoes,
          resultadoPos.consolidado.viewportTopo,
        );
        if (processadoPos) {
          const candidatoPost = {
            frame: pos.frame,
            consolidado: resultadoPos.consolidado,
            processado: processadoPos,
            origem: "pos" as const,
          };
          escolhido = selecionarCaptura(escolhido, candidatoPost, true).captura;
        }
      }
    }
  }

  if (escolhido.origem === "pos") {
    const cons = escolhido.consolidado;
    const processado = escolhido.processado;
    const revisaoPost = cons.revisaoNecessaria || processado.sugestoesMascara.length > 0;
    await atualizarImagemPasso(correlacaoId, {
      imagemRedigida: processado.dataUrl,
      redacaoIncompleta: false,
      revisaoPrivacidadeNecessaria: revisaoPost,
      sugestoesMascara: processado.sugestoesMascara,
      ocorridoEm: passo.acao.fim,
    });
    return;
  }

}

async function processarMensagem(
  tabId: number,
  frameId: number,
  msg: MensagemCS,
): Promise<void> {
  // Garante que `sessaoAtiva` já foi restaurada (ver comentário acima) antes
  // de decidir se esta aba tem sessão — sem isto, o PRIMEIRO clique do
  // usuário depois de um reinício do service worker (a causa mais comum de
  // o worker acordar) podia chegar antes da restauração e ser descartado.
  await restauracaoDaSessaoAtiva;

  if (msg.tipo === "relatorio") {
    pendentesRelatorio.get(tabId)?.get(frameId)?.(msg.relatorio);
    return;
  }

  const sessao = sessaoAtiva;
  if (sessao === undefined || sessao.tabId !== tabId) {
    return;
  }

  if (msg.tipo === "mudanca-pos-acao") {
    sinalizarMudancaPosAcao(tabId, msg.instanteApontar);
    return;
  }

  if (msg.tipo === "gatilho") {
    iniciarGatilho(tabId, frameId, msg);
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

// Web (PassoGuia) entrega o sessaoId diretamente ao abrir /gravacao — ver ponte-web.ts.
iniciarPonteWeb();

/**
 * Clique no ícone: encerra a sessão da aba (toggle) OU inicia — injetando o content
 * script na aba ativa via chrome.scripting (concessão activeTab). Sem content_scripts
 * estático e sem <all_urls>: só a aba clicada é instrumentada.
 */
async function aoClicarNoIcone(tab: chrome.tabs.Tab): Promise<void> {
  // permissions.request precisa começar dentro do gesto da action. É pedida
  // uma única vez para permitir a reinjeção automática após navegar entre
  // origens; ela não substitui nem controla a MediaStream do tabCapture.
  const permissaoNavegacao = sessaoAtiva?.tabId === tab.id
    ? Promise.resolve(true)
    : solicitarPermissaoParaNavegacoes();

  // Ver comentário em `restauracaoDaSessaoAtiva` — sem isto, clicar no ícone
  // logo depois de um reinício do service worker podia "não ver" a sessão
  // que na verdade só estava esperando ser restaurada.
  await restauracaoDaSessaoAtiva;

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
    void pararCapturaStream();
    void marcarIconeInativo(tabId);
    void limparSessaoAtivaPersistida(); // encerramento normal — não sobra estado persistido "preso".
    console.info("[extensao-gravador][sessao] encerrada; aba", tabId);
    return;
  }

  const origemDoClique = origemDe(tab.url);
  const origem = origemDoClique;

  if (!(await permissaoNavegacao)) {
    console.warn("[extensao-gravador][permissao] acesso para reinjeção entre origens não concedido");
    return;
  }

  const streamIniciada = await iniciarCapturaStream(tabId);
  if (!streamIniciada) {
    console.error("[extensao-gravador][captura-stream][erro] sessão não iniciada sem stream de aba");
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
      void pararCapturaStream();
      return; // sem content script não há como capturar: sessão NÃO inicia (ícone segue normal)
    }
    abasInjetadas.add(tabId);
    console.info(
      "[extensao-gravador][injecao] conteudo.js injetado em",
      alvo,
      `— ${resultado.frames} frame(s)`,
      resultado.motivo ? `(${resultado.motivo})` : "",
    );
  }

  if (origem === "") {
    console.warn(
      "[extensao-gravador][sessao] origem da sessão não pôde ser determinada; qualquer navegação pausará a sessão",
    );
  }
  const sitesAutorizados = origem !== "" ? [origem] : [];
  sessaoAtiva = { tabId, windowId: tab.windowId, sitesAutorizados, pausada: false };
  void marcarIconeAtivo(tabId);
  void persistirSessaoAtiva({ tabId, windowId: tab.windowId, sitesAutorizados, pausada: false }); // sobrevive a um reinício do service worker.
  // Identificação automática do sistema alvo: a API guarda essa origem na
  // sessão (PATCH /sessoes/:sessaoId) — nunca pedida ao usuário em "Novo
  // manual". Sem origem confirmável (acima), não há nada de real para
  // reportar — nunca envia um valor mockado/fallback.
  if (origem !== "") {
    void atualizarOrigemDaSessao(origem);
  }
  console.info(
    "[extensao-gravador][sessao] ativa; aba",
    tabId,
    "janela",
    tab.windowId,
    "origem",
    origem || "(desconhecida)",
  );
}

chrome.action.onClicked.addListener((tab) => {
  aoClicarNoIcone(tab).catch((erro: unknown) => {
    console.error("[extensao-gravador][sessao][erro] falha ao alternar captura", erro);
  });
});

function limparEstadoDaAba(tabId: number): void {
  gravadoresPorAba.delete(tabId);
  preAcoesPorAba.delete(tabId);
  portasPorAba.delete(tabId);
  pendentesRelatorio.delete(tabId);
  abasInjetadas.delete(tabId);
}

/** Campos de chrome.tabs.onUpdated realmente usados aqui. */
interface InfoNavegacao {
  status?: string;
  url?: string;
}

/**
 * Lifecycle de navegação da aba:
 *  - mesma origem autorizada: mantém a sessão, limpa o estado do documento
 *    antigo e reinjeta ao completar;
 *  - qualquer navegação web: mantém a sessão e reinjeta o content script
 *    automaticamente quando o novo documento termina de carregar.
 */
async function aoAtualizarAba(tabId: number, changeInfo: InfoNavegacao): Promise<void> {
  const status = changeInfo.status;
  if (status !== "loading" && status !== "complete") {
    if (changeInfo.url && sessaoAtiva?.tabId === tabId && !sessaoAtiva.pausada) {
      setTimeout(() => sinalizarNavegacaoParaPost(tabId), ATRASO_DEBOUNCE_NAVEGACAO_MS);
    }
    return; // pushState / título / favicon: content script segue vivo
  }

  // Ver comentário em `restauracaoDaSessaoAtiva` — um evento de navegação
  // pode chegar antes da restauração terminar, logo depois de um reinício
  // do service worker.
  await restauracaoDaSessaoAtiva;

  const sessao = sessaoAtiva;
  if (sessao?.tabId !== tabId) {
    if (status === "loading") {
      limparEstadoDaAba(tabId); // higiene de aba sem sessão
    }
    return;
  }

  if (status === "loading") {
    registrarNavegacaoIniciada(tabId);
    // Documento antigo saindo: limpa estado do documento, preserva a sessão
    // e deixa a captura tabCapture atravessar a navegação.
    limparEstadoDaAba(tabId);
    return;
  }

  // status === "complete": decide de forma autoritativa pela URL atual da aba.
  const urlAtual = await urlDaAba(tabId);
  const decisaoCompleta = decidirNavegacao(sessao.sitesAutorizados, urlAtual);
  if (decisaoCompleta.tipo === "manter-url-desconhecida") {
    return;
  }
  if (abasInjetadas.has(tabId)) {
    await aguardar(ATRASO_DEBOUNCE_NAVEGACAO_MS);
    sinalizarNavegacaoParaPost(tabId);
    return; // já injetado neste documento
  }
  const resultado = await injetarNaAba(tabId);
  if (!resultado.ok) {
    console.error(
      "[extensao-gravador][injecao][erro] reinjeção same-site falhou em",
      urlAtual ?? "(url indisponível)",
      "—",
      resultado.motivo ?? "motivo desconhecido",
    );
    return;
  }
  abasInjetadas.add(tabId);
  // Reforça o ícone laranja após a reinjeção: o setIcon por tabId de antes da
  // navegação nem sempre sobrevive à troca de documento — sem isto, a aba
  // podia voltar a mostrar o ícone normal mesmo com a sessão ainda ativa.
  void marcarIconeAtivo(tabId);
  console.info(
    "[extensao-gravador][injecao] conteudo.js reinjetado (navegação same-site); aba",
    tabId,
    `— ${resultado.frames} frame(s) | ${sessao.sitesAutorizados.join(", ")}`,
  );
  await aguardar(ATRASO_DEBOUNCE_NAVEGACAO_MS);
  sinalizarNavegacaoParaPost(tabId);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  aoAtualizarAba(tabId, changeInfo).catch((erro: unknown) => {
    console.error("[extensao-gravador][navegacao][erro] falha ao processar atualização", erro);
  });
});

// Fechamento da aba.
chrome.tabs.onRemoved.addListener((tabId) => {
  limparEstadoDaAba(tabId);
  void restauracaoDaSessaoAtiva.then(() => {
    if (sessaoAtiva?.tabId === tabId) {
      sessaoAtiva = undefined;
      void pararCapturaStream();
      void limparSessaoAtivaPersistida(); // encerramento normal (aba fechada) — nunca sobra estado persistido "preso".
    }
  });
});
