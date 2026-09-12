/**
 * Verificação leve de visibilidade REAL de um elemento — usada antes de
 * incluir qualquer região no blur do screenshot. Existir no DOM não basta:
 * um elemento com display:none, visibility:hidden/collapse, opacity:0 ou
 * sem interseção com o viewport não aparece no frame capturado, então
 * nunca deve virar região de blur (senão mascara área vazia da imagem).
 *
 * Deliberadamente simples (sem subir a árvore de ancestrais nem simular
 * oclusão por outros elementos): cobre o caso real reportado — campos
 * escondidos (painéis fechados, linhas colapsadas) que continuam no DOM.
 */
import type { Retangulo, ViewportCss } from "./protocolo";

function estiloEscondeElemento(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) {
    return false; // sem view não há estilo computado — não bloqueia por engano
  }
  const estilo = view.getComputedStyle(el);
  // Ambiente de teste (happy-dom) reporta opacity computado como string vazia
  // quando não há regra CSS aplicada — "" não é "opacity:0", então só conta
  // como oculto quando o valor numérico existir e for de fato 0.
  const opacidadeZero = estilo.opacity !== "" && Number(estilo.opacity) === 0;
  return (
    estilo.display === "none" ||
    estilo.visibility === "hidden" ||
    estilo.visibility === "collapse" ||
    opacidadeZero
  );
}

function intersectaViewport(r: DOMRect, vp: ViewportCss): boolean {
  return (
    r.width > 0 &&
    r.height > 0 &&
    r.bottom > 0 &&
    r.right > 0 &&
    r.top < vp.altura &&
    r.left < vp.largura
  );
}

/**
 * Retângulo do elemento SE ele estiver efetivamente visível no frame: estilo
 * computado que não o esconde (display/visibility/opacity) e geometria com
 * interseção real com o viewport. `undefined` caso contrário — quem chama
 * nunca deve gerar região de blur para algo que não aparece na imagem.
 */
export function retanguloSeVisivel(el: Element, vp: ViewportCss): Retangulo | undefined {
  if (estiloEscondeElemento(el)) {
    return undefined;
  }
  const r = el.getBoundingClientRect();
  return intersectaViewport(r, vp)
    ? { x: r.x, y: r.y, largura: r.width, altura: r.height }
    : undefined;
}
