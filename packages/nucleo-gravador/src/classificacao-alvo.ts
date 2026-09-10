import type { DescricaoAlvo } from "./tipos-evento";

/**
 * O adaptador lê estes dados crus do DOM e passa ao núcleo.
 * O núcleo aplica as regras — não toca no DOM.
 */
export interface DadosBrutosAlvo {
  etiqueta: string;
  seletor?: string;
  textoVisivel?: string;
  rotuloAria?: string;
  tipoInput?: string;
  editavelEfetivo?: boolean;
  acionavelPorSeletor?: boolean;
}

/** Seletor CSS que define "elemento acionável" (fonte única da regra). */
export const SELETOR_ACIONAVEL =
  'button, a, summary, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]';

const ETIQUETAS_CAMPO = new Set(["input", "textarea", "select"]);

export function classificarAlvo(brutos: DadosBrutosAlvo): DescricaoAlvo {
  const sensivel = brutos.tipoInput === "password";
  const campoEditavel =
    brutos.editavelEfetivo === true || ETIQUETAS_CAMPO.has(brutos.etiqueta);

  const descricao: DescricaoAlvo = {
    etiqueta: brutos.etiqueta,
    acionavel: brutos.acionavelPorSeletor === true,
    campoEditavel,
    sensivel,
  };
  if (brutos.seletor) {
    descricao.seletor = brutos.seletor;
  }
  if (brutos.rotuloAria) {
    descricao.rotuloAcessivel = brutos.rotuloAria;
  }
  // Texto visível nunca é propagado de campos (evita vazar valor via textContent).
  if (!campoEditavel && brutos.textoVisivel) {
    descricao.texto = brutos.textoVisivel;
  }
  return descricao;
}
