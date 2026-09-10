/** Descrição segura de um elemento do DOM alvo. Nunca inclui valores digitados. */

const MAX_TEXTO = 40;

// Elementos acionáveis: geram passo candidato no CLICK.
const SELETOR_ACIONAVEL =
  'button, a, summary, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]';

export interface DescricaoElemento {
  tag?: string;
  seletor?: string;
  texto?: string;
  ariaLabel?: string;
  /** Alvo é (ou está dentro de) input/textarea/select/contenteditable efetivamente editável. */
  campo?: boolean;
  /** Alvo é (ou está dentro de) um input[type=password]. */
  senha?: boolean;
  /** Alvo é (ou está dentro de) um elemento acionável (button/a/role=button/…). */
  acionavel?: boolean;
}

export function descrever(alvo: EventTarget | null): DescricaoElemento {
  if (!(alvo instanceof Element)) {
    return {};
  }
  const descricao: DescricaoElemento = {
    tag: alvo.tagName.toLowerCase(),
    seletor: seletorCurto(alvo),
  };
  const aria = alvo.getAttribute("aria-label")?.trim();
  if (aria) {
    descricao.ariaLabel = aria.slice(0, MAX_TEXTO);
  }
  const emCampo = dentroDeCampo(alvo);
  if (emCampo) {
    descricao.campo = true;
  } else {
    const texto = (alvo.textContent ?? "").replace(/\s+/g, " ").trim();
    if (texto) {
      descricao.texto = texto.slice(0, MAX_TEXTO);
    }
  }
  if (dentroDeSenha(alvo)) {
    descricao.senha = true;
  }
  if (ehAcionavel(alvo)) {
    descricao.acionavel = true;
  }
  return descricao;
}

export function dentroDeCampo(el: Element): boolean {
  if (el.closest("input, textarea, select") !== null) {
    return true;
  }
  // contenteditable: só conta se estiver EFETIVAMENTE editável
  // (isContentEditable respeita herança e contenteditable="false").
  return el instanceof HTMLElement && el.isContentEditable;
}

export function ehAcionavel(el: Element): boolean {
  return el.closest(SELETOR_ACIONAVEL) !== null;
}

export function dentroDeSenha(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof Element)) {
    return false;
  }
  const campo = alvo.closest("input");
  return campo instanceof HTMLInputElement && campo.type === "password";
}

export function seletorCurto(el: Element): string {
  const partes: string[] = [];
  let atual: Element | null = el;
  let nivel = 0;
  while (atual && atual !== document.body && nivel < 3) {
    partes.unshift(token(atual));
    if (atual.id) {
      break;
    }
    atual = atual.parentElement;
    nivel += 1;
  }
  return partes.join(" > ");
}

function token(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) {
    return `${tag}#${el.id}`;
  }
  const classe = el.classList[0];
  if (classe) {
    return `${tag}.${classe}`;
  }
  const pai = el.parentElement;
  if (pai) {
    const irmaos = Array.from(pai.children).filter((n) => n.tagName === el.tagName);
    if (irmaos.length > 1) {
      return `${tag}:nth-of-type(${irmaos.indexOf(el) + 1})`;
    }
  }
  return tag;
}
