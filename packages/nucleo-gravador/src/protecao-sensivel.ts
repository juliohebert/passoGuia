import type { DescricaoAlvo, EventoCapturado } from "./tipos-evento";

export function ehAlvoSensivel(alvo: DescricaoAlvo | undefined): boolean {
  return alvo?.sensivel === true;
}

/**
 * Recorta o evento para os campos permitidos.
 * Garante que nenhum valor/caractere/tamanho digitado atravesse o núcleo,
 * mesmo que um adaptador envie campos extras.
 */
export function sanearEvento(bruto: EventoCapturado): EventoCapturado {
  const evento: EventoCapturado = {
    tipo: bruto.tipo,
    instante: bruto.instante,
    url: bruto.url,
  };
  if (bruto.posicao) {
    evento.posicao = { x: bruto.posicao.x, y: bruto.posicao.y };
  }
  if (bruto.alvo) {
    evento.alvo = sanearAlvo(bruto.alvo);
  }
  return evento;
}

function sanearAlvo(alvo: DescricaoAlvo): DescricaoAlvo {
  const seguro: DescricaoAlvo = {
    acionavel: alvo.acionavel === true,
    campoEditavel: alvo.campoEditavel === true,
    sensivel: alvo.sensivel === true,
  };
  if (alvo.etiqueta) {
    seguro.etiqueta = alvo.etiqueta;
  }
  if (alvo.seletor) {
    seguro.seletor = alvo.seletor;
  }
  if (alvo.rotuloAcessivel) {
    seguro.rotuloAcessivel = alvo.rotuloAcessivel;
  }
  // Texto de campo (mesmo não-senha) pode conter valor via textContent -> descartar.
  if (alvo.texto && alvo.campoEditavel !== true && alvo.sensivel !== true) {
    seguro.texto = alvo.texto;
  }
  return seguro;
}
