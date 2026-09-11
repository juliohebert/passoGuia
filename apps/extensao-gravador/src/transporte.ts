import { NOME_PORTA, type MensagemCS, type RelatorioFrame } from "./protocolo";

let porta: chrome.runtime.Port | undefined;
let montarRelatorio: (() => RelatorioFrame) | undefined;

function conectar(): chrome.runtime.Port {
  const nova = chrome.runtime.connect({ name: NOME_PORTA });
  nova.onDisconnect.addListener(() => {
    if (porta === nova) {
      porta = undefined;
    }
  });
  nova.onMessage.addListener((msg: unknown) => {
    if ((msg as { tipo?: string } | null)?.tipo === "pedir-relatorio" && montarRelatorio) {
      const resposta: MensagemCS = { tipo: "relatorio", relatorio: montarRelatorio() };
      try {
        nova.postMessage(resposta);
      } catch {
        // porta caiu antes da resposta
      }
    }
  });
  porta = nova;
  return nova;
}

/** Conecta a porta e registra como responder aos pedidos de relatório do SW. */
export function iniciarTransporte(fn: () => RelatorioFrame): void {
  montarRelatorio = fn;
  conectar();
}

/**
 * Envia uma mensagem ao service worker; reconecta uma vez se a porta estiver obsoleta.
 * Sem fila/persistência nesta prova: se falhar duas vezes, a mensagem é descartada.
 */
export function enviarMensagem(mensagem: MensagemCS): void {
  const atual = porta ?? conectar();
  try {
    atual.postMessage(mensagem);
  } catch {
    porta = undefined;
    try {
      conectar().postMessage(mensagem);
    } catch {
      // desiste desta mensagem
    }
  }
}
