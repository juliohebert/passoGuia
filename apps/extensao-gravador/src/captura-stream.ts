export interface Frame {
  dataUrl: string;
  formato: "jpeg";
  bytes: number;
  instante: number;
}

type RespostaFrame = { ok: true; dataUrl: string } | { ok: false; motivo?: string };

let filaFrames: Promise<void> = Promise.resolve();
let capturaAtiva = false;
let erroFatal: ((motivo: string) => void) | undefined;

export function registrarErroFatalDaCaptura(handler: (motivo: string) => void): void {
  erroFatal = handler;
}

export async function iniciarCapturaStream(tabId: number): Promise<boolean> {
  try {
    await garantirDocumentoOffscreen();
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    const resposta = await enviarAoOffscreen({ tipo: "captura-stream", acao: "iniciar", streamId });
    if (!resposta.ok) {
      throw new Error(resposta.motivo ?? "offscreen não iniciou a stream");
    }
    capturaAtiva = true;
    return true;
  } catch (erro) {
    console.error("[extensao-gravador][captura-stream][erro] não foi possível iniciar", erro);
    return false;
  }
}

export async function restaurarCapturaStream(): Promise<boolean> {
  try {
    await garantirDocumentoOffscreen();
    const resposta = await enviarAoOffscreen({ tipo: "captura-stream", acao: "status" });
    capturaAtiva = resposta.ok;
    return capturaAtiva;
  } catch {
    capturaAtiva = false;
    return false;
  }
}

export async function capturarFrameAtual(): Promise<Frame | null> {
  if (!capturaAtiva) {
    return null;
  }
  const captura = filaFrames.then(async () => {
    try {
      const resposta = await enviarAoOffscreen({ tipo: "captura-stream", acao: "frame" });
      if (!resposta.ok) {
        return null;
      }
      return criarFrame(resposta.dataUrl);
    } catch (erro) {
      console.error("[extensao-gravador][captura-stream][erro] falha ao extrair frame", erro);
      return null;
    }
  });
  filaFrames = captura.then(() => undefined, () => undefined);
  return captura;
}

export async function pararCapturaStream(): Promise<void> {
  capturaAtiva = false;
  filaFrames = Promise.resolve();
  try {
    await enviarAoOffscreen({ tipo: "captura-stream", acao: "parar" });
    await chrome.offscreen.closeDocument();
  } catch {
    // O documento pode já ter sido fechado junto com a aba ou por erro fatal.
  }
}

async function garantirDocumentoOffscreen(): Promise<void> {
  const url = chrome.runtime.getURL("offscreen.html");
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [url],
  });
  if (contexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: "Manter a captura da aba e extrair screenshots da gravação.",
    });
  }
}

function enviarAoOffscreen(mensagem: Record<string, unknown>): Promise<RespostaFrame> {
  return chrome.runtime.sendMessage(mensagem) as Promise<RespostaFrame>;
}

function criarFrame(dataUrl: string): Frame {
  const virgula = dataUrl.indexOf(",");
  const base64 = virgula >= 0 ? dataUrl.slice(virgula + 1) : dataUrl;
  return {
    dataUrl,
    formato: "jpeg",
    bytes: Math.floor((base64.length * 3) / 4),
    instante: Date.now(),
  };
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((mensagem: unknown) => {
    const dado = mensagem as { tipo?: string; motivo?: string } | null;
    if (dado?.tipo === "captura-stream-erro") {
      capturaAtiva = false;
      erroFatal?.(dado.motivo ?? "stream encerrada");
    }
    return false;
  });
}
