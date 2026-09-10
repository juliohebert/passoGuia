import { SELETOR_ACIONAVEL, classificarAlvo, type DescricaoAlvo } from "@passoguia/nucleo-gravador";

/**
 * Lê do DOM apenas o necessário e delega a classificação ao núcleo.
 * (Mesma responsabilidade no embed — candidato a pacote compartilhado.)
 */
export function criarDescricaoAlvo(alvo: Element): DescricaoAlvo {
  const aria = alvo.getAttribute("aria-label");
  return classificarAlvo({
    etiqueta: alvo.tagName.toLowerCase(),
    seletor: alvo.id ? `#${alvo.id}` : alvo.tagName.toLowerCase(),
    editavelEfetivo: alvo instanceof HTMLElement && alvo.isContentEditable,
    acionavelPorSeletor: alvo.closest(SELETOR_ACIONAVEL) !== null,
    ...(alvo.closest('input[type="password"]') ? { tipoInput: "password" } : {}),
    ...(aria ? { rotuloAria: aria } : {}),
  });
}
