/**
 * `sessaoId` entregue DIRETAMENTE pela web à extensão (ver ponte-web.ts,
 * chrome.runtime.onMessageExternal) — nunca mais resolvido via clienteId
 * contra um Map na API (GET /sessoes/ativa?clienteId=). Persistido em
 * `chrome.storage.session`: sobrevive a reinícios/suspensões do service
 * worker MV3, mas nunca ao navegador fechar (mesma política de
 * sessao-persistida.ts). Guardado à parte do estado de CAPTURA (tabId/
 * windowId/sitesAutorizados): a web entrega o sessaoId assim que /gravacao
 * abre, antes (ou independente) de o usuário clicar no ícone da extensão em
 * alguma aba.
 */
const CHAVE_ARMAZENAMENTO = "sessaoIdAtiva";

/** Nunca lança — falha ao persistir não pode quebrar a página /gravacao. */
export async function persistirSessaoId(sessaoId: string): Promise<void> {
  try {
    await chrome.storage.session.set({ [CHAVE_ARMAZENAMENTO]: sessaoId });
  } catch {
    // pior caso: a extensão não sabe para qual sessão postar até a web reenviar.
  }
}

/** `undefined` se nada foi entregue ainda, o valor é inválido, ou a API falhar. Nunca lança. */
export async function lerSessaoId(): Promise<string | undefined> {
  try {
    const armazenado = await chrome.storage.session.get(CHAVE_ARMAZENAMENTO);
    const valor = armazenado[CHAVE_ARMAZENAMENTO];
    return typeof valor === "string" && valor.trim() !== "" ? valor : undefined;
  } catch {
    return undefined;
  }
}

/** Nunca lança. Não é chamado hoje em nenhum fluxo normal — mantido por simetria com sessao-persistida.ts. */
export async function limparSessaoId(): Promise<void> {
  try {
    await chrome.storage.session.remove(CHAVE_ARMAZENAMENTO);
  } catch {
    // não crítico.
  }
}
