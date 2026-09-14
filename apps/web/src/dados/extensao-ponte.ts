/**
 * Ponte web -> extensão: entrega o `sessaoId` da gravação DIRETAMENTE à
 * extensão do PassoGuia instalada localmente (ver
 * apps/extensao-gravador/src/ponte-web.ts/sessao-id.ts), assim que /gravacao
 * abre — sem passar por nenhum vínculo clienteId<->sessaoId na API: a
 * extensão persiste o sessaoId recebido (chrome.storage.session) e passa a
 * usá-lo para todo POST/PATCH de sessão. Usa `chrome.runtime.sendMessage`
 * com o id da extensão: essa API existe em qualquer página, mesmo sem
 * nenhuma extensão instalada — só funciona de fato quando a extensão
 * declara esta origem em "externally_connectable" (ver manifest.json).
 */
const TIPO_DEFINIR_SESSAO_ATIVA = "definir-sessao-ativa";
/** Id estável da extensão (manifest.json tem uma "key" fixa para isso não mudar a cada reload). */
const ID_EXTENSAO = process.env.NEXT_PUBLIC_EXTENSAO_ID ?? "iljkehaockedckdhblplmpkagjabfdbm";
/** Extensão não instalada não responde — nunca trava a tela esperando para sempre. */
const TIMEOUT_MS = 2500;

interface ChromeRuntimeExterno {
  sendMessage(
    idExtensao: string,
    mensagem: unknown,
    callback: (resposta: unknown) => void,
  ): void;
  readonly lastError?: { message?: string };
}

function chromeRuntimeExterno(): ChromeRuntimeExterno | undefined {
  const global = globalThis as unknown as { chrome?: { runtime?: ChromeRuntimeExterno } };
  return typeof global.chrome?.runtime?.sendMessage === "function" ? global.chrome.runtime : undefined;
}

/**
 * `true` só quando a extensão está instalada, respondeu a tempo, esta
 * origem está autorizada em "externally_connectable", e confirmou ter
 * persistido o sessaoId. `false` em qualquer outro caso — nunca lança.
 */
export function enviarSessaoParaExtensao(sessaoId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const runtime = chromeRuntimeExterno();
    if (!runtime) {
      resolve(false);
      return;
    }

    let resolvido = false;
    function finalizar(valor: boolean): void {
      if (!resolvido) {
        resolvido = true;
        resolve(valor);
      }
    }

    const timer = setTimeout(() => {
      finalizar(false);
    }, TIMEOUT_MS);

    try {
      runtime.sendMessage(ID_EXTENSAO, { tipo: TIPO_DEFINIR_SESSAO_ATIVA, sessaoId }, (resposta) => {
        clearTimeout(timer);
        if (runtime.lastError) {
          finalizar(false);
          return;
        }
        const ok = (resposta as { ok?: unknown } | undefined)?.ok;
        finalizar(ok === true);
      });
    } catch {
      clearTimeout(timer);
      finalizar(false);
    }
  });
}
