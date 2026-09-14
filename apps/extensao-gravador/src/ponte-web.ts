import { persistirSessaoId } from "./sessao-id";
import { TIPO_DEFINIR_SESSAO_ATIVA, type RespostaDefinirSessaoAtiva } from "./protocolo";

/**
 * Bridge web -> extensão: recebe o `sessaoId` da gravação DIRETAMENTE da
 * página web do PassoGuia (chrome.runtime.onMessageExternal, habilitado só
 * para a origem local da web em "externally_connectable" no manifest.json) e
 * persiste em chrome.storage.session (ver sessao-id.ts) — é assim que
 * /gravacao vincula a sessão automaticamente ao abrir, sem depender de
 * nenhum vínculo clienteId<->sessaoId na API. Nunca recebe nem devolve dados
 * capturados: só o sessaoId.
 */
export function iniciarPonteWeb(): void {
  chrome.runtime.onMessageExternal.addListener((mensagem: unknown, _remetente, sendResponse) => {
    if (
      typeof mensagem !== "object" ||
      mensagem === null ||
      (mensagem as { tipo?: unknown }).tipo !== TIPO_DEFINIR_SESSAO_ATIVA
    ) {
      return false; // não é para nós — nunca interfere com outras mensagens externas
    }
    const sessaoId = (mensagem as { sessaoId?: unknown }).sessaoId;
    if (typeof sessaoId !== "string" || sessaoId.trim() === "") {
      const resposta: RespostaDefinirSessaoAtiva = { ok: false };
      sendResponse(resposta);
      return false;
    }
    void persistirSessaoId(sessaoId.trim()).then(() => {
      const resposta: RespostaDefinirSessaoAtiva = { ok: true };
      sendResponse(resposta);
    });
    return true; // mantém o canal aberto para a resposta assíncrona
  });
}
