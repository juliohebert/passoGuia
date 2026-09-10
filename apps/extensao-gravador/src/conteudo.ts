import type { EventoCapturado } from "@passoguia/nucleo-gravador";
import { criarDescricaoAlvo } from "./descritor-alvo";

/**
 * Content script — adaptador de ORIGEM.
 * Papel final: escutar eventos do DOM, traduzir para EventoCapturado e enviar
 * ao service worker (que fala com o núcleo).
 * Scaffold: liga apenas "pointerdown" como demonstração da tradução.
 */
function iniciar(): void {
  window.addEventListener(
    "pointerdown",
    (evento) => {
      const alvo =
        evento.target instanceof Element ? criarDescricaoAlvo(evento.target) : undefined;
      const capturado: EventoCapturado = {
        tipo: "apontar",
        instante: evento.timeStamp,
        url: location.href,
        posicao: { x: Math.round(evento.clientX), y: Math.round(evento.clientY) },
        ...(alvo ? { alvo } : {}),
      };
      chrome.runtime.sendMessage(capturado);
      // TODO: demais tipos (clicar/editar/teclar/rolar/navegar) + relógio compartilhado
    },
    { capture: true, passive: true },
  );
}

iniciar();
