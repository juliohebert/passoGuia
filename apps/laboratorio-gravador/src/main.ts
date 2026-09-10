import { iniciarCapturaTela, type CapturaTela } from "./captura-tela";
import { criarCronometro, type Cronometro } from "./cronometro";
import { iniciarColetorEventos, type ColetorEventos } from "./eventos-alvo";
import { formatarAcao, formatarEvento } from "./formato";
import { criarInterface } from "./interface";
import { criarNormalizador, type AcaoNormalizada, type Normalizador } from "./normalizador";

// Espera curta para a interface do alvo estabilizar antes do screenshot automático.
const ATRASO_ESTABILIZAR_MS = 400;

const raiz = document.querySelector<HTMLDivElement>("#app");
if (!raiz) {
  throw new Error("Elemento #app não encontrado.");
}

const ui = criarInterface(raiz);

let captura: CapturaTela | undefined;
let cronometro: Cronometro | undefined;
let coletor: ColetorEventos | undefined;
let normalizador: Normalizador | undefined;
let inicioSessaoEpoch = 0;
let ultimaMarcaEpoch = 0;
let totalBrutos = 0;
let totalAcoes = 0;
let totalPassos = 0;
let sessaoAtiva = false;
let iniciando = false;
let cadeiaAuto: Promise<void> = Promise.resolve();

function atualizarContadores(): void {
  ui.definirContadores({ brutos: totalBrutos, acoes: totalAcoes, passos: totalPassos });
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => {
    window.setTimeout(resolver, ms);
  });
}

function normalizarUrl(entrada: string): string {
  const texto = entrada.trim();
  if (!texto) {
    throw new Error("Informe uma URL.");
  }
  const comProtocolo = /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;
  return new URL(comProtocolo).toString();
}

function encerrar(): void {
  if (!sessaoAtiva) {
    return;
  }
  sessaoAtiva = false;
  cronometro?.parar();
  coletor?.parar();
  normalizador?.parar();
  ui.marcarFinalizada();
}

function finalizar(): void {
  captura?.parar();
  encerrar();
}

function registrarPasso(
  imagem: Blob,
  titulo: string,
  linhas: string[],
  origem: "auto" | "manual",
): void {
  totalPassos += 1;
  ui.adicionarPasso({ imagemUrl: URL.createObjectURL(imagem), titulo, linhas, origem });
  atualizarContadores();
}

async function processarPassoAuto(acao: AcaoNormalizada): Promise<void> {
  if (!sessaoAtiva || !captura) {
    return;
  }
  await esperar(ATRASO_ESTABILIZAR_MS);
  if (!sessaoAtiva || !captura || !captura.temFrameValido()) {
    return;
  }
  let imagem: Blob;
  try {
    imagem = await captura.extrairFrame();
  } catch {
    return;
  }
  const alvo = acao.seletor ?? acao.tag ?? "";
  registrarPasso(
    imagem,
    `${acao.tipo}${alvo ? ` ${alvo}` : ""}`,
    [formatarAcao(acao, inicioSessaoEpoch)],
    "auto",
  );
  ultimaMarcaEpoch = Math.max(ultimaMarcaEpoch, acao.fim);
}

function agendarPassoAuto(acao: AcaoNormalizada): void {
  cadeiaAuto = cadeiaAuto.then(() => processarPassoAuto(acao)).catch(() => undefined);
}

/**
 * Regras de geração de passo candidato automático:
 *  - CLICK: só gera passo se o alvo for acionável (button/a/role=button/…);
 *    CLICK em div/span neutro ou em campo não gera passo;
 *  - PREENCHIMENTO: gera 1 passo por campo consolidado, EXCETO campo de senha;
 *  - SCROLL / NAVEGACAO: nunca geram passo.
 */
function deveGerarPasso(acao: AcaoNormalizada): boolean {
  switch (acao.tipo) {
    case "CLICK":
      return acao.acionavel === true;
    case "PREENCHIMENTO":
      return acao.senha !== true;
    default:
      return false;
  }
}

function aoAcaoNormalizada(acao: AcaoNormalizada): void {
  totalAcoes += 1;
  ui.adicionarAcao(formatarAcao(acao, inicioSessaoEpoch));
  atualizarContadores();
  if (deveGerarPasso(acao)) {
    agendarPassoAuto(acao);
  }
}

async function capturarPassoManual(): Promise<void> {
  if (!sessaoAtiva || !captura) {
    return;
  }
  let imagem: Blob;
  try {
    imagem = await captura.extrairFrame();
  } catch {
    ui.mostrarErro("Falha ao capturar o frame atual.");
    return;
  }
  const epochCaptura = Date.now();
  const brutos = coletor?.entre(ultimaMarcaEpoch, epochCaptura) ?? [];
  const rel = ((epochCaptura - inicioSessaoEpoch) / 1000).toFixed(1);
  registrarPasso(
    imagem,
    `Manual — t+${rel}s`,
    brutos.length
      ? brutos.map((evento) => formatarEvento(evento, inicioSessaoEpoch))
      : ["(sem eventos brutos no intervalo)"],
    "manual",
  );
  ultimaMarcaEpoch = epochCaptura;
}

async function iniciar(urlInformada: string): Promise<void> {
  if (iniciando || sessaoAtiva) {
    return;
  }
  iniciando = true;
  ui.limparErro();

  try {
    let urlAlvo: string;
    try {
      urlAlvo = normalizarUrl(urlInformada);
    } catch (erro) {
      ui.mostrarErro(erro instanceof Error ? erro.message : "URL inválida.");
      return;
    }

    let capturaAtiva: CapturaTela;
    try {
      capturaAtiva = await iniciarCapturaTela();
    } catch {
      ui.mostrarErro("Não foi possível iniciar a captura de tela.");
      return;
    }
    captura = capturaAtiva;

    // Observa o encerramento ANTES de considerar a sessão ativa/exibida.
    sessaoAtiva = true;
    capturaAtiva.aoEncerrar(() => {
      encerrar();
    });
    if (!sessaoAtiva) {
      captura = undefined;
      ui.mostrarErro("O compartilhamento foi encerrado antes do início da sessão.");
      return;
    }

    totalBrutos = 0;
    totalAcoes = 0;
    totalPassos = 0;
    cadeiaAuto = Promise.resolve();

    ui.renderizarSessao({
      aoCapturarManual: () => void capturarPassoManual(),
      aoFinalizar: finalizar,
    });
    atualizarContadores();

    inicioSessaoEpoch = Date.now();
    ultimaMarcaEpoch = inicioSessaoEpoch;
    cronometro = criarCronometro((texto) => {
      ui.definirTempo(texto);
    });
    cronometro.iniciar();

    normalizador = criarNormalizador(aoAcaoNormalizada);

    // O botão manual (fallback) só é liberado quando o <video> tem um frame válido.
    void capturaAtiva.pronta.then(() => {
      if (sessaoAtiva && capturaAtiva.temFrameValido()) {
        ui.habilitarCaptura();
      }
    });

    // Sem "noopener": a página alvo precisa de window.opener para o canal cooperativo.
    const janelaAlvo = window.open(urlAlvo, "_blank");
    coletor = iniciarColetorEventos({
      origem: window.location.origin,
      janelaAlvo,
      aoReceber: (evento) => {
        totalBrutos += 1;
        ui.adicionarEventoBruto(formatarEvento(evento, inicioSessaoEpoch));
        atualizarContadores();
        normalizador?.aoEvento(evento);
      },
    });
  } finally {
    iniciando = false;
  }
}

ui.renderizarInicio({
  aoIniciar: (url) => void iniciar(url),
});
