import { criarGravador } from "@passoguia/nucleo-gravador";
import type { EventoCapturado } from "@passoguia/nucleo-gravador";

/**
 * Service worker — adaptador de TRANSPORTE.
 * Papel final: manter um Gravador do núcleo por aba/sessão, receber
 * EventoCapturado dos content scripts e devolver PassoCandidato[] à UI de revisão.
 * Scaffold: um Gravador único, sem persistência, sem screenshot.
 */
const gravador = criarGravador();

chrome.runtime.onInstalled.addListener(() => {
  // TODO: inicializar estado por aba
});

chrome.runtime.onMessage.addListener((mensagem: unknown) => {
  const passos = gravador.receber(mensagem as EventoCapturado);
  if (passos.length === 0) {
    return;
  }
  // TODO: encaminhar `passos` à UI de revisão; agendar screenshot quando passo.capturarTela
});
