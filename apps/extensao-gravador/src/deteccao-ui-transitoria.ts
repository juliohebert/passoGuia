/**
 * Heurística leve para decidir se um clique provavelmente abre UI TRANSITÓRIA
 * (select/dropdown/menu/autocomplete/modal/popover) que só existe DEPOIS do
 * clique. Nesses casos o screenshot PRE-AÇÃO (tirado antes da lista abrir)
 * nunca mostra o conteúdo revelado — por isso também capturamos um POST,
 * depois de uma pequena estabilização, e escolhemos POST para o passo.
 *
 * Deliberadamente baseada só em marcadores estruturais/ARIA presentes no
 * alvo (ou no elemento acionável resolvido) no instante do clique — nunca em
 * observar se algo de fato abriu (isso exigiria um MutationObserver e viraria
 * um algoritmo bem mais complexo do que o necessário aqui).
 */
const ROLES_UI_TRANSITORIA = new Set([
  "combobox",
  "listbox",
  "menu",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "dialog",
  "alertdialog",
]);

const VALORES_ARIA_HASPOPUP_TRANSITORIOS = new Set([
  "true",
  "listbox",
  "menu",
  "dialog",
  "grid",
  "tree",
]);

function marcaUiTransitoria(el: Element): boolean {
  if (el instanceof HTMLSelectElement) {
    return true;
  }
  if (el instanceof HTMLInputElement && el.hasAttribute("list")) {
    return true; // <input list="..."> — autocomplete nativo via <datalist>
  }
  const role = el.getAttribute("role");
  if (role && ROLES_UI_TRANSITORIA.has(role.toLowerCase())) {
    return true;
  }
  const haspopup = el.getAttribute("aria-haspopup");
  if (haspopup && VALORES_ARIA_HASPOPUP_TRANSITORIOS.has(haspopup.toLowerCase())) {
    return true;
  }
  // Presença do atributo (não seu valor) já sinaliza um widget expansível
  // (o clique é justamente o que alterna aria-expanded="false" -> "true").
  if (el.hasAttribute("aria-expanded")) {
    return true;
  }
  return false;
}

/**
 * `true` quando o alvo clicado OU o elemento acionável resolvido a partir dele
 * sinaliza abertura de UI transitória. Checa os dois porque o alvo real do
 * clique costuma ser um ícone/span interno, enquanto o marcador ARIA
 * geralmente está no elemento acionável (ex.: o `button[aria-haspopup]`).
 */
export function abreUiTransitoria(
  alvoEl: Element | null | undefined,
  acionavelEl: Element | null | undefined,
): boolean {
  if (alvoEl && marcaUiTransitoria(alvoEl)) {
    return true;
  }
  return Boolean(acionavelEl && marcaUiTransitoria(acionavelEl));
}
