/**
 * Persistência mínima da sessão de captura ativa em `chrome.storage.session`
 * — sobrevive a reinícios/suspensões do service worker MV3 (que zeram
 * qualquer `let` em memória), mas nunca ao navegador fechar (storage
 * `session`, não `local`). Guarda o essencial para retomar sem o usuário
 * clicar de novo no ícone: `tabId`, `windowId`, a lista de SITES já
 * autorizados nesta gravação (`sitesAutorizados` — uma gravação pode
 * autorizar vários sistemas ao longo do tempo, ver mesmo-site.ts) e se a
 * sessão está `pausada` (navegou para um site ainda não autorizado —
 * ver servico.ts: PAUSAR nunca encerra a gravação).
 *
 * NUNCA guarda o `sessaoId` do PassoGuia aqui — esse valor é entregue
 * DIRETAMENTE pela web (ver ponte-web.ts) e persistido à parte, em
 * sessao-id.ts: são conceitos independentes (o sessaoId chega antes/
 * independente de o usuário clicar no ícone em alguma aba).
 */
const CHAVE_ARMAZENAMENTO = "sessaoAtivaPersistida";

export interface SessaoAtivaPersistida {
  tabId: number;
  windowId: number;
  sitesAutorizados: string[];
  pausada: boolean;
}

export function ehSessaoAtivaPersistidaValida(valor: unknown): valor is SessaoAtivaPersistida {
  if (typeof valor !== "object" || valor === null) {
    return false;
  }
  const candidato = valor as Record<string, unknown>;
  return (
    typeof candidato.tabId === "number" &&
    typeof candidato.windowId === "number" &&
    Array.isArray(candidato.sitesAutorizados) &&
    candidato.sitesAutorizados.every((site) => typeof site === "string") &&
    typeof candidato.pausada === "boolean"
  );
}

/** Nunca lança — falha ao persistir não pode derrubar a captura (que já está ativa de qualquer forma). */
export async function persistirSessaoAtiva(sessao: SessaoAtivaPersistida): Promise<void> {
  try {
    await chrome.storage.session.set({ [CHAVE_ARMAZENAMENTO]: sessao });
  } catch {
    // pior caso: não sobrevive a um reinício do service worker.
  }
}

/** `undefined` se não há nada persistido, o valor é inválido, ou a API falhar. Nunca lança. */
export async function lerSessaoAtivaPersistida(): Promise<SessaoAtivaPersistida | undefined> {
  try {
    const armazenado = await chrome.storage.session.get(CHAVE_ARMAZENAMENTO);
    const valor = armazenado[CHAVE_ARMAZENAMENTO];
    return ehSessaoAtivaPersistidaValida(valor) ? valor : undefined;
  } catch {
    return undefined;
  }
}

/** Chamado em todo encerramento NORMAL (toggle manual, saída do site, aba fechada) — nunca num reinício do service worker. Nunca lança. */
export async function limparSessaoAtivaPersistida(): Promise<void> {
  try {
    await chrome.storage.session.remove(CHAVE_ARMAZENAMENTO);
  } catch {
    // não crítico.
  }
}
