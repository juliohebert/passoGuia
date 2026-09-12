/**
 * Nome acessível e contexto local do elemento clicado — usados para gerar o
 * título/descrição humanos do passo (nunca nome de tag HTML, nunca
 * value/conteúdo digitado).
 *
 * Prioridade do nome (determinística, sem IA):
 *   0. se o alvo está em CONTEXTO ESTRUTURALMENTE SENSÍVEL (coluna/célula com
 *      cabeçalho sensível, <dt>/<dd> sensível, região aria-label sensível):
 *      nunca lê aria-label/label/title/texto do alvo — usa só o rótulo
 *      estrutural seguro (ex.: cabeçalho "Paciente") ou nada (fallback
 *      humano genérico de quem chama).
 *   1. aria-label
 *   2. label associado (label[for=id] / <label> ancestral / aria-labelledby)
 *   3. atributo title
 *   4. texto visível seguro (nunca de campo de formulário)
 *   5. mesmas prioridades 1-4 aplicadas ao elemento acionável pai
 *   6. undefined — quem consome decide o fallback humano (nunca tag HTML)
 */
import { SELETOR_ACIONAVEL } from "@passoguia/nucleo-gravador";
import { ehCampoEditavel } from "./descoberta-campo";
import { estaEmContextoEstruturalSensivel, rotuloEstruturalSeguro } from "./descoberta-texto-sensivel";

const MAX_TEXTO = 80;
const SELETOR_CAMPO_EDITAVEL = 'input, textarea, select, [contenteditable="true"], [role="textbox"]';

function limpo(texto: string | null | undefined): string | undefined {
  if (!texto) {
    return undefined;
  }
  const t = texto.replace(/\s+/g, " ").trim();
  return t !== "" ? t.slice(0, MAX_TEXTO) : undefined;
}

/** Rótulo associado: label[for=id] -> <label> ancestral -> aria-labelledby. */
function rotuloAssociado(el: Element): string | undefined {
  const id = el.getAttribute("id");
  if (id) {
    try {
      const rotulo = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
      const texto = limpo(rotulo?.textContent);
      if (texto) {
        return texto;
      }
    } catch {
      // id com formato incomum para seletor CSS — ignora e tenta os outros.
    }
  }

  const ancestral = limpo(el.closest("label")?.textContent);
  if (ancestral) {
    return ancestral;
  }

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const textos = labelledBy
      .split(/\s+/)
      .filter(Boolean)
      .map((refId) => limpo(el.ownerDocument.getElementById(refId)?.textContent))
      .filter((t): t is string => Boolean(t));
    if (textos.length > 0) {
      return textos.join(" ");
    }
  }
  return undefined;
}

/**
 * Texto visível "seguro": nunca de um campo de formulário nem de um
 * container que tenha um campo editável dentro (evitaria vazar conteúdo
 * digitado via textContent agregado).
 */
function textoVisivelSeguro(el: Element): string | undefined {
  if (ehCampoEditavel(el) || el.querySelector(SELETOR_CAMPO_EDITAVEL)) {
    return undefined;
  }
  return limpo(el.textContent);
}

/** Prioridades 1-4 aplicadas a UM único elemento (sem subir para o pai). */
function nomePorPrioridade(el: Element): string | undefined {
  return (
    limpo(el.getAttribute("aria-label")) ??
    rotuloAssociado(el) ??
    limpo(el.getAttribute("title")) ??
    textoVisivelSeguro(el)
  );
}

/**
 * Nome acessível do elemento clicado, com fallback para o elemento acionável
 * pai (prioridade 5) — ex.: um <svg>/<path> de ícone dentro de um <button>
 * sem rótulo próprio. Nunca lê value nem conteúdo digitado.
 *
 * Se o alvo estiver em contexto estruturalmente sensível (ex.: coluna
 * "Paciente", <dt>"CPF"</dt>), NUNCA usa aria-label/label/title/texto do
 * alvo — o closest() ancestral já cobre qualquer elemento acionável pai
 * dentro da mesma região, então essa checagem sozinha é suficiente.
 */
export function nomeAcessivelDoAlvo(el: Element): string | undefined {
  if (estaEmContextoEstruturalSensivel(el)) {
    return rotuloEstruturalSeguro(el);
  }

  const proprio = nomePorPrioridade(el);
  if (proprio) {
    return proprio;
  }
  const pai = el.closest(SELETOR_ACIONAVEL);
  if (pai && pai !== el) {
    return nomePorPrioridade(pai);
  }
  return undefined;
}

/** Contexto local curto (landmark mais próximo) — usado na descrição do passo. */
const CONTEXTOS: ReadonlyArray<readonly [string, string]> = [
  ['[role="dialog"], dialog', "Na janela aberta"],
  ["nav", "No menu"],
  ["aside", "No painel lateral"],
  ["header", "Na barra superior"],
  ["footer", "No rodapé"],
];

export function contextoDoAlvo(el: Element): string | undefined {
  for (const [seletor, frase] of CONTEXTOS) {
    if (el.closest(seletor)) {
      return frase;
    }
  }
  return undefined;
}
