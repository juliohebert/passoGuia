import { SELETOR_ACIONAVEL } from "@passoguia/nucleo-gravador";

/**
 * Resolve o elemento acionável real a partir do alvo de um clique.
 *
 * Primeiro tenta o marcador estrutural único (SELETOR_ACIONAVEL, no núcleo:
 * button/a/summary/input.../role=button|menuitem|option|tab|link). Quando
 * nada estrutural é encontrado, aplica uma heurística restrita — evidenciada
 * no QuarkClinic — para <li>/<div> que se comportam como item interativo sem
 * nenhuma marcação semântica:
 *
 *   tabindex >= 0 (autor declarou foco/intenção de interação) E
 *   cursor computado "pointer" (reforça affordance de clique, não decorativo)
 *
 * As DUAS condições são exigidas juntas — nem todo <li>/<div>, nem todo
 * elemento com cursor:pointer isolado, vira acionável. A busca sobe pelos
 * ancestrais (mais próximo primeiro) até um limite raso, cobrindo o caso de
 * clique num <svg>/<span> de ícone dentro do item.
 */
const LIMITE_ANCESTRAIS_HEURISTICA = 8;

function focavel(el: Element): boolean {
  const bruto = el.getAttribute("tabindex");
  if (bruto === null) {
    return false;
  }
  const n = Number(bruto);
  return Number.isFinite(n) && n >= 0;
}

function cursorPointer(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) {
    return false;
  }
  return view.getComputedStyle(el).cursor === "pointer";
}

/** Só <li>/<div>: escopo mínimo, evidenciado no diagnóstico real do QuarkClinic. */
function itemInterativoSemMarcacao(el: Element): boolean {
  if (el.tagName !== "LI" && el.tagName !== "DIV") {
    return false;
  }
  return focavel(el) && cursorPointer(el);
}

export function resolverElementoAcionavel(el: Element | undefined | null): Element | null {
  let atual: Element | null = el ?? null;
  let profundidade = 0;
  while (atual && profundidade < LIMITE_ANCESTRAIS_HEURISTICA) {
    if (atual.matches(SELETOR_ACIONAVEL) || itemInterativoSemMarcacao(atual)) {
      return atual;
    }
    atual = atual.parentElement;
    profundidade += 1;
  }
  // Além do limite raso da heurística, ainda cobre ancestrais estruturais
  // distantes (sem custo de computed style) via o closest() nativo.
  return el ? el.closest(SELETOR_ACIONAVEL) : null;
}
