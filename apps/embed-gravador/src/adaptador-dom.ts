import { criarGravador, type EventoCapturado, type Gravador } from "@passoguia/nucleo-gravador";
import { criarDescricaoAlvo } from "./descritor-alvo";

/**
 * Adaptador DOM -> núcleo para o modo embed (script carregado na página hospedeira).
 * Papel final: escutar eventos do DOM, traduzir para EventoCapturado, alimentar
 * o Gravador e expor os PassoCandidato ao chamador.
 * Scaffold: liga apenas "pointerdown".
 */
export function criarGravadorEmbed(): Gravador {
  return criarGravador();
}

export function ligarCapturaDom(gravador: Gravador): () => void {
  const aoApontar = (evento: PointerEvent): void => {
    const alvo =
      evento.target instanceof Element ? criarDescricaoAlvo(evento.target) : undefined;
    const capturado: EventoCapturado = {
      tipo: "apontar",
      instante: evento.timeStamp,
      url: window.location.href,
      posicao: { x: Math.round(evento.clientX), y: Math.round(evento.clientY) },
      ...(alvo ? { alvo } : {}),
    };
    gravador.receber(capturado);
    // TODO: demais tipos + descarregar() por inatividade + emissão de PassoCandidato
  };

  window.addEventListener("pointerdown", aoApontar, { capture: true, passive: true });
  return () => {
    window.removeEventListener("pointerdown", aoApontar, { capture: true });
  };
}
