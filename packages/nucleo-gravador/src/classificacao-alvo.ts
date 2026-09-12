import { pareceSensivel, type MetadadosCampo } from "./sensibilidade-campo";
import type { DescricaoAlvo } from "./tipos-evento";

/**
 * O adaptador lê estes dados crus do DOM e passa ao núcleo.
 * O núcleo aplica as regras — não toca no DOM.
 */
export interface DadosBrutosAlvo extends MetadadosCampo {
  etiqueta: string;
  seletor?: string;
  textoVisivel?: string;
  editavelEfetivo?: boolean;
  acionavelPorSeletor?: boolean;
  /**
   * Nome para exibição humana, já resolvido pelo adaptador por prioridade
   * (aria-label -> label associado -> title -> texto visível seguro ->
   * elemento acionável pai) — usado no título/descrição do passo. Nunca é
   * nome de tag HTML nem conteúdo digitado.
   */
  nomeExibicao?: string;
  /** Contexto local curto de onde o alvo está na tela (ex.: "No menu"). */
  contextoLocal?: string;
}

/**
 * Seletor CSS que define "elemento acionável" (fonte única da regra).
 * Roles ARIA de item interativo (menuitem/option/tab/link) cobrem <li>/<div>
 * de menus, listas de opções, abas e links customizados — evidenciado no
 * diagnóstico real do QuarkClinic (li/div de menu sem <a>/<button>).
 *
 * `select` está aqui (não só em ETIQUETAS_CAMPO): abrir um <select> nativo é
 * uma ação de navegação de UI (revela uma lista), igual a abrir um menu — sem
 * isso, o clique que abre o dropdown nunca vira PassoCandidato (avaliarPasso
 * só promove CLIQUE quando acionavel===true) e nenhum screenshot é tentado.
 */
export const SELETOR_ACIONAVEL =
  'button, a, summary, select, [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="link"], input[type="button"], input[type="submit"], input[type="reset"]';

const ETIQUETAS_CAMPO = new Set(["input", "textarea", "select"]);

export function classificarAlvo(brutos: DadosBrutosAlvo): DescricaoAlvo {
  const sensivel = pareceSensivel(brutos);
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
  // nomeExibicao (prioridade completa, resolvida pelo adaptador) tem preferência;
  // rotuloAria (só aria-label literal) fica como rede de segurança.
  if (brutos.nomeExibicao) {
    descricao.rotuloAcessivel = brutos.nomeExibicao;
  } else if (brutos.rotuloAria) {
    descricao.rotuloAcessivel = brutos.rotuloAria;
  }
  if (brutos.contextoLocal) {
    descricao.contextoLocal = brutos.contextoLocal;
  }
  // Texto visível nunca é propagado de campos (evita vazar valor via textContent).
  if (!campoEditavel && brutos.textoVisivel) {
    descricao.texto = brutos.textoVisivel;
  }
  return descricao;
}
