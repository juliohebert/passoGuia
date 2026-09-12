import { criarGravador, type Gravador } from "@passoguia/nucleo-gravador";
import type { PassoCandidato } from "@passoguia/nucleo-gravador";
import { capturarAbaVisivel, type Frame } from "./captura-tela";
import { descricaoDoPasso } from "./descricao-passo";
import { DIAGNOSTICO_ATIVO } from "./diagnostico-flag";
import { prepararCaptura, type FrameProcessado } from "./destaque-frame";
import { enviarPasso } from "./envio-api";
import { injetarNaAba } from "./injecao";
import {
  adicionarPreAcao,
  aguardarComTimeout,
  localizarEConsumirPreAcao,
  podarPreAcoes,
} from "./pre-acoes";
import { NOME_PORTA, type MensagemCS, type Retangulo, type RelatorioFrame } from "./protocolo";
import { consolidarRedacao, type Consolidado } from "./redacao-consolidacao";
import {
  registrarFrameDoPasso,
  registrarPassoComRevisao,
  registrarPassoSemFrame,
} from "./registro-prova";
import {
  TIPO_LISTAR,
  type RegistroProva,
  type RespostaListar,
} from "./tipos-diagnostico";
import { tituloDoPasso } from "./titulo-passo";

// Retenção só em memória para a página de diagnóstico (sem storage).
const MAX_REGISTROS = 20;
// Quanto esperar os relatórios dos demais frames antes de decidir fail-safe.
const TIMEOUT_RELATORIO_MS = 200;
// Pequena estabilização antes do screenshot POST — dá tempo do dropdown/menu/
// modal terminar de abrir (animação/render) antes de capturar a aba.
const ATRASO_ESTABILIZACAO_POS_MS = 180;
// Máximo de PRE-AÇÕES pendentes por aba (buffer, não mais um slot único —
// ver PreAcao/preAcoesPorAba). Cliques rápidos consecutivos ficam todos em
// voo ao mesmo tempo (pointerdown dispara a captura antes do clique fechar a
// ação); um único slot sobrescrito perdia a PRE-AÇÃO de um clique quando o
// próximo pointerdown chegava antes da consolidação do anterior.
const MAX_PRE_PENDENTES_POR_ABA = 8;
// Poda por idade: uma PRE-AÇÃO nunca reclamada por tempo maior que isso é
// lixo (clique nunca fechou uma ação) — descartada para não vazar memória.
const TTL_PRE_PENDENTE_MS = 8000;
// Quanto tempo, no máximo, o consolidarPasso espera pela captura PRE já em
// voo antes de desistir e enviar o passo sem imagem — nunca trava o restante
// do recorder (outras mensagens continuam processando normalmente).
const TIMEOUT_ESPERA_PRE_MS = 1500;

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
  diagId: string | undefined;
  criadoEm: number;
  instanteApontar: number;
  triggerFrameId: number;
  triggerUrl: string;
  triggerRelatorio: RelatorioFrame;
  alvoRect: Retangulo;
  framePromise: Promise<Frame | null>;
  /** true assim que framePromise resolve — só para diagnóstico ("PRE pronta ou pendente?"). */
  frameResolvido: boolean;
  relatoriosPromise: Promise<Map<number, RelatorioFrame>>;
  abreUiTransitoria: boolean;
  posPromise: Promise<CapturaPos> | undefined;
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
/**
 * BUFFER (não mais um slot único) de PRE-AÇÕES em voo por aba — associa cada
 * captura PRE ao seu próprio gatilho/correlação (instanteApontar), nunca a
 * "a mais recente da aba". Um clique consome (remove) só a SUA entrada
 * (match exato por instante), preservando as demais em voo. Ver
 * localizarEConsumirPreAcao / podarPreAcoes.
 */
const preAcoesPorAba = new Map<number, PreAcao[]>();
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
  windowId: number,
  triggerFrameId: number,
): Promise<CapturaPos> {
  await aguardar(ATRASO_ESTABILIZACAO_POS_MS);
  const [frame, relatorios] = await Promise.all([
    capturarAbaVisivel(windowId),
    coletarRelatorios(tabId),
  ]);
  return { frame, triggerRelatorio: relatorios.get(triggerFrameId), outros: relatorios };
}

function iniciarGatilho(
  tabId: number,
  windowId: number,
  frameId: number,
  msg: Extract<MensagemCS, { tipo: "gatilho" }>,
): void {
  const instanteApontar = msg.evento.instante;
  const criadoEm = Date.now();
  if (DIAGNOSTICO_ATIVO) {
    console.info("[diag][servico] início da captura PRE", {
      diagId: msg.diagId,
      tabId,
      instanteApontar,
    });
  }
  const nova: PreAcao = {
    diagId: msg.diagId,
    criadoEm,
    instanteApontar,
    triggerFrameId: frameId,
    triggerUrl: portasPorAba.get(tabId)?.get(frameId)?.url ?? "",
    triggerRelatorio: msg.relatorio,
    alvoRect: msg.alvoRect,
    framePromise: capturarAbaVisivel(windowId),
    frameResolvido: false,
    relatoriosPromise: coletarRelatorios(tabId, frameId),
    abreUiTransitoria: msg.abreUiTransitoria,
    posPromise: msg.abreUiTransitoria ? capturarPos(tabId, windowId, frameId) : undefined,
  };
  // Não inicia uma segunda captura: só anexa um tap diagnóstico à MESMA promise.
  nova.framePromise = nova.framePromise.then((frame) => {
    nova.frameResolvido = true;
    if (DIAGNOSTICO_ATIVO) {
      console.info("[diag][servico] fim da captura PRE", {
        diagId: msg.diagId,
        tabId,
        instanteApontar,
        sucesso: frame !== null,
        duracaoMs: Date.now() - criadoEm,
      });
    }
    return frame;
  });

  adicionarPreAcao(preAcoesPorAba, tabId, nova, MAX_PRE_PENDENTES_POR_ABA, TTL_PRE_PENDENTE_MS);
}

function registroSemImagem(
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
  alvoRect: Retangulo,
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
  diagId?: string,
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
  if (DIAGNOSTICO_ATIVO) {
    console.info("[diag][servico] chegada do click", {
      diagId,
      tabId,
      seletor: passo.acao.alvo?.seletor,
      acaoInicio: passo.acao.inicio,
      preEncontrada: pre !== undefined,
      preJaPronta: pre?.frameResolvido === true,
    });
  }

  const correlacaoId = crypto.randomUUID();
  // DIAGNOSTICO TEMP: correlaciona o diagId (conteudo.ts) com o correlacaoId real
  // (o único id que efetivamente viaja até a API).
  if (DIAGNOSTICO_ATIVO) {
    console.info("[diag][servico] correlacaoId atribuído", {
      diagId,
      correlacaoId,
      seletor: passo.acao.alvo?.seletor,
      temPreAcao: pre !== undefined,
    });
  }

  // NOVA POLÍTICA: privacidade nunca mais descarta a imagem inteira. Um passo só
  // fica sem screenshot por razão de INFRAESTRUTURA (sem PRE-AÇÃO / sem frame /
  // falha de canvas) — nunca porque a detecção automática de regiões sensíveis
  // não teve 100% de certeza. Nesse caso a imagem VAI, marcada com
  // revisaoPrivacidadeNecessaria=true.
  const enviarSemImagem = (motivos: string[]): void => {
    guardarRegistro(registroSemImagem(correlacaoId, passo, motivos));
    registrarPassoSemFrame(tabId, passo, motivos.join("; "));
    if (DIAGNOSTICO_ATIVO) {
      console.info("[diag][servico] enviando passo SEM imagem (infra)", {
        diagId,
        correlacaoId,
        motivos,
      });
    }
    void enviarPasso({
      ...payloadBase(correlacaoId, passo),
      redacaoIncompleta: true,
      revisaoPrivacidadeNecessaria: false,
      ocorridoEm: passo.acao.fim,
    });
  };

  if (!pre) {
    enviarSemImagem(["sem pré-ação registrada para este clique"]);
    return;
  }

  // localizarEConsumirPreAcao já garante instanteApontar === passo.acao.inicio
  // (match exato) — não inicia uma segunda captura: só ESPERA a que já está em
  // voo, com um teto curto para nunca travar o recorder caso ela demore demais.
  const { valor: framePre, expirou } = await aguardarComTimeout(
    pre.framePromise,
    TIMEOUT_ESPERA_PRE_MS,
  );
  registrarFrameDoPasso(correlacaoId, tabId, passo, framePre);
  if (DIAGNOSTICO_ATIVO) {
    console.info("[diag][servico] momento da consolidação", {
      diagId,
      correlacaoId,
      capturaPreDisponivel: framePre !== null,
      esperouTimeout: expirou,
    });
  }

  if (expirou) {
    enviarSemImagem([
      `screenshot PRE-AÇÃO não terminou a tempo (timeout de ${String(TIMEOUT_ESPERA_PRE_MS)}ms)`,
    ]);
    return;
  }
  if (!framePre) {
    enviarSemImagem(["screenshot PRE-AÇÃO indisponível"]);
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
    enviarSemImagem(
      resultadoPre.consolidado.motivos.length
        ? resultadoPre.consolidado.motivos
        : ["consolidação de redação impossível"],
    );
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
    enviarSemImagem(["falha ao processar a captura"]);
    return;
  }

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

  if (pre.abreUiTransitoria && pre.posPromise) {
    const pos = await pre.posPromise;
    let motivoDescartePos: string | undefined;
    if (!pos.frame) {
      motivoDescartePos = "captureVisibleTab falhou no POST";
    } else if (!pos.triggerRelatorio) {
      motivoDescartePos = "frame de disparo não respondeu ao pedido de relatório POST (timeout)";
    } else {
      const resultadoPos = processarCaptura(
        pre.triggerFrameId,
        pre.triggerUrl,
        pos.triggerRelatorio,
        pre.alvoRect,
        pos.outros,
        tabId,
      );
      if (resultadoPos.redacaoIncompleta || !resultadoPos.consolidado.viewportTopo) {
        motivoDescartePos = "consolidação das sugestões POST ficou incompleta (sem viewport de topo)";
      } else {
        const processadoPos = await prepararCaptura(
          pos.frame,
          resultadoPos.consolidado.alvoRectTopo,
          resultadoPos.consolidado.sugestoes,
          resultadoPos.consolidado.viewportTopo,
        );
        if (processadoPos) {
          escolhido = {
            frame: pos.frame,
            consolidado: resultadoPos.consolidado,
            processado: processadoPos,
            origem: "pos",
          };
        } else {
          motivoDescartePos = "falha ao processar a captura do POST";
        }
      }
    }
    // DIAGNOSTICO TEMP: por que um alvo sinalizado como abreUiTransitoria acabou
    // (ou não) usando o screenshot POST — correlaciona com o log de conteudo.ts via diagId.
    if (DIAGNOSTICO_ATIVO) {
      console.info("[diag][servico] captura escolhida (alvo abre UI transitória)", {
        diagId,
        correlacaoId,
        capturaEscolhida: escolhido.origem,
        motivoDescartePos,
      });
    }
  }

  const cons = escolhido.consolidado;
  const processado = escolhido.processado;
  const sugestoesMascara = processado.sugestoesMascara;
  // revisaoPrivacidadeNecessaria agora significa "existem sugestões de
  // máscara (ou incerteza de consolidação) para o usuário revisar" — nunca
  // mais "detecção automática decidiu mascarar com menos certeza": NADA é
  // mascarado automaticamente, então toda sugestão passa por revisão humana.
  const revisaoPrivacidadeNecessaria = cons.revisaoNecessaria || sugestoesMascara.length > 0;
  const motivosRevisao =
    sugestoesMascara.length > 0
      ? [
          ...cons.motivos,
          `${String(sugestoesMascara.length)} sugestão(ões) de máscara de privacidade para revisar`,
        ]
      : cons.motivos;

  guardarRegistro({
    correlacaoId,
    tipoAcao: passo.acao.tipo,
    seletor: passo.acao.alvo?.seletor,
    pre: {
      dataUrl: processado.dataUrl,
      bytes: processado.bytes,
      instante: escolhido.frame.instante,
    },
    origemCaptura: escolhido.origem,
    redacaoIncompleta: false,
    revisaoPrivacidadeNecessaria,
    motivos: motivosRevisao,
    sugestoesMascara,
    ...(processado.caixaImagem ? { caixa: processado.caixaImagem } : {}),
    escala: { x: processado.escalaX, y: processado.escalaY },
  });

  if (revisaoPrivacidadeNecessaria) {
    registrarPassoComRevisao(tabId, passo, motivosRevisao);
  }
  if (DIAGNOSTICO_ATIVO) {
    console.info("[diag][servico] enviando passo COM imagem", {
      diagId,
      correlacaoId,
      revisaoPrivacidadeNecessaria,
      sugestoesMascara: sugestoesMascara.length,
    });
  }
  // A partir daqui sempre existe screenshot: a imagem vai sempre junto, e vai
  // sempre INTACTA (processado.dataUrl nunca é reprocessado/desenhado).
  void enviarPasso({
    ...payloadBase(correlacaoId, passo),
    imagemRedigida: processado.dataUrl,
    redacaoIncompleta: false,
    revisaoPrivacidadeNecessaria,
    sugestoesMascara,
    ocorridoEm: passo.acao.fim,
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
    // DIAGNOSTICO TEMP: sessão não ativa para esta aba => tudo é descartado aqui,
    // antes até da normalização/relevância. Causa comum de "clique não virou passo".
    if (DIAGNOSTICO_ATIVO) {
      console.info("[diag][servico] mensagem ignorada: sem sessão ativa para a aba", {
        diagId: "diagId" in msg ? msg.diagId : undefined,
        tabId,
        sessaoAtivaTabId: sessao?.tabId,
      });
    }
    return; // a prova só roda na aba autorizada pelo clique na action
  }

  if (msg.tipo === "gatilho") {
    iniciarGatilho(tabId, sessao.windowId, frameId, msg);
  }

  const passos = gravadorDaAba(tabId).receber(msg.evento);
  // DIAGNOSTICO TEMP: resultado da normalização+relevância (núcleo) para este evento.
  if (DIAGNOSTICO_ATIVO) {
    console.info("[diag][servico] normalização/relevância", {
      diagId: "diagId" in msg ? msg.diagId : undefined,
      tipoEvento: msg.evento.tipo,
      seletorAlvo: msg.evento.alvo?.seletor,
      acionavel: msg.evento.alvo?.acionavel === true,
      passosGerados: passos.length,
      motivo:
        passos.length === 0
          ? "evento não fechou uma ação relevante ainda (aguardando ou descartado por avaliarPasso)"
          : undefined,
    });
  }
  for (const passo of passos) {
    await consolidarPasso(tabId, passo, "diagId" in msg ? msg.diagId : undefined);
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
  preAcoesPorAba.delete(tabId);
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
