/**
 * Injeção do content script na aba ativa via chrome.scripting.executeScript.
 * Usa a concessão activeTab do clique na action — sem <all_urls>, sem content_scripts estático.
 */
const ARQUIVO_CONTEUDO = "dist/conteudo.js";

export interface ResultadoInjecao {
  ok: boolean;
  frames: number;
  motivo?: string;
}

export async function injetarNaAba(tabId: number): Promise<ResultadoInjecao> {
  try {
    // allFrames: injeta em todos os frames ACESSÍVEIS (mesma origem + topo);
    // frames cross-origin sem acesso são silenciosamente ignorados pelo Chrome.
    const resultados = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [ARQUIVO_CONTEUDO],
    });
    return { ok: true, frames: resultados.length };
  } catch (erro) {
    return {
      ok: false,
      frames: 0,
      motivo: erro instanceof Error ? erro.message : String(erro),
    };
  }
}
