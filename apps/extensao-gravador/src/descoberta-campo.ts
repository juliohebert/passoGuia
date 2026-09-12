/**
 * Descoberta de campos editáveis no DOM — decide QUAIS elementos são
 * candidatos a campo (para então classificar com pareceSensivel, do núcleo).
 * Cobre input/textarea/select, contentEditable e role="textbox" (o marcador
 * ARIA correto para um widget customizado que se comporta como caixa de
 * texto). Componentes customizados que renderizam um <input>/<textarea>
 * real internamente já são cobertos: a varredura percorre todo descendente
 * (inclusive dentro de shadow roots abertos), então o campo real interno é
 * visitado e classificado por si mesmo.
 */
export function ehCampoEditavel(el: Element): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable) ||
    el.getAttribute("role") === "textbox"
  );
}
