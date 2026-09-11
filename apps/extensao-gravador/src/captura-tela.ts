/**
 * Captura da aba visível via chrome.tabs.captureVisibleTab.
 * Sem chrome.debugger, sem full-page. Resultado só em memória (prova).
 */
export interface Frame {
  dataUrl: string;
  formato: "jpeg";
  bytes: number;
  instante: number;
}

export async function capturarAbaVisivel(windowId: number): Promise<Frame | null> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: "jpeg",
      quality: 60,
    });
    return {
      dataUrl,
      formato: "jpeg",
      bytes: estimarBytes(dataUrl),
      instante: Date.now(),
    };
  } catch (erro) {
    // LOG TEMPORÁRIO — diagnóstico do frame:null de captureVisibleTab
    console.error(
      "[extensao-gravador][captura][erro]",
      erro instanceof Error ? erro.message : String(erro),
    );
    return null;
  }
}

function estimarBytes(dataUrl: string): number {
  const virgula = dataUrl.indexOf(",");
  const base64 = virgula >= 0 ? dataUrl.slice(virgula + 1) : dataUrl;
  return Math.floor((base64.length * 3) / 4);
}
