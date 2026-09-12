import type { MetadadosCampo } from "@passoguia/nucleo-gravador";

/**
 * Lê SOMENTE metadados seguros do elemento — type, name, id, aria-label,
 * aria-labelledby, placeholder, autocomplete e o texto do <label> associado
 * (por for=id ou ancestral). Nunca lê value/textContent de campo, nunca o
 * que o usuário digitou. A classificação em si (pareceSensivel) mora no núcleo.
 */
function atributo(el: Element, nome: string): string | undefined {
  const valor = el.getAttribute(nome);
  return valor && valor.trim() !== "" ? valor.trim() : undefined;
}

/** Texto de rótulo: <label for=id>, <label> ancestral e/ou aria-labelledby — combinados. */
function textoDoRotulo(el: Element): string | undefined {
  const textos: string[] = [];

  const id = el.getAttribute("id");
  if (id) {
    try {
      const rotulo = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
      const texto = rotulo?.textContent?.trim();
      if (texto) {
        textos.push(texto);
      }
    } catch {
      // id com formato incomum para seletor CSS — ignora e tenta os outros rótulos.
    }
  }

  const textoAncestral = el.closest("label")?.textContent?.trim();
  if (textoAncestral) {
    textos.push(textoAncestral);
  }

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    for (const refId of labelledBy.split(/\s+/).filter(Boolean)) {
      const texto = el.ownerDocument.getElementById(refId)?.textContent?.trim();
      if (texto) {
        textos.push(texto);
      }
    }
  }

  return textos.length > 0 ? textos.join(" ") : undefined;
}

export function metadadosDoCampo(el: Element): MetadadosCampo {
  const tipoInput = el instanceof HTMLInputElement ? el.type : undefined;
  const contentEditable = el instanceof HTMLElement && el.isContentEditable;
  const roleTextbox = atributo(el, "role") === "textbox";
  const autocompletar = atributo(el, "autocomplete");
  const name = atributo(el, "name");
  const id = atributo(el, "id");
  const rotuloAria = atributo(el, "aria-label");
  const placeholder = atributo(el, "placeholder");
  const textoRotulo = textoDoRotulo(el);

  // contentEditable/role=textbox genérico sem nenhum metadado próprio: não dá
  // para classificar com segurança — fail-safe é aplicado por pareceSensivel.
  const semMetadadoConfiavel =
    (contentEditable || roleTextbox) &&
    !autocompletar &&
    !name &&
    !id &&
    !rotuloAria &&
    !placeholder &&
    !textoRotulo;

  return {
    ...(tipoInput ? { tipoInput } : {}),
    ...(autocompletar ? { autocompletar } : {}),
    ...(name ? { name } : {}),
    ...(id ? { id } : {}),
    ...(rotuloAria ? { rotuloAria } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(textoRotulo ? { textoRotulo } : {}),
    classificavelComSeguranca: !semMetadadoConfiavel,
  };
}
