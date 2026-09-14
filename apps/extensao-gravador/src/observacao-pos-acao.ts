const SILENCIO_ESTABILIZACAO_MS = 180;
const LIMITE_OBSERVACAO_MS = 1200;

interface ObservacaoAtiva {
  instanteApontar: number;
  baseline: string;
  observer: MutationObserver;
  timerSilencio: ReturnType<typeof setTimeout> | undefined;
  timerLimite: ReturnType<typeof setTimeout>;
  encontrouMutacao: boolean;
  enviarMudanca: (instanteApontar: number) => void;
}

let observacaoAtiva: ObservacaoAtiva | undefined;

export function iniciarObservacaoPosAcao(
  instanteApontar: number,
  enviarMudanca: (instanteApontar: number) => void,
): void {
  finalizarObservacaoPosAcao();
  const observer = new MutationObserver((mutacoes) => {
    if (!mutacoes.some(mutacaoPodeAlterarTela) || !observacaoAtiva) {
      return;
    }
    observacaoAtiva.encontrouMutacao = true;
    if (observacaoAtiva.timerSilencio) {
      clearTimeout(observacaoAtiva.timerSilencio);
    }
    observacaoAtiva.timerSilencio = setTimeout(finalizarObservacaoPosAcao, SILENCIO_ESTABILIZACAO_MS);
  });
  const ativa: ObservacaoAtiva = {
    instanteApontar,
    baseline: assinaturaVisual(document),
    observer,
    timerSilencio: undefined,
    timerLimite: setTimeout(finalizarObservacaoPosAcao, LIMITE_OBSERVACAO_MS),
    encontrouMutacao: false,
    enviarMudanca,
  };
  observacaoAtiva = ativa;
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-expanded", "aria-hidden", "class", "hidden", "open", "style"],
    characterData: true,
  });
}

export function finalizarObservacaoPosAcao(): void {
  const ativa = observacaoAtiva;
  if (!ativa) {
    return;
  }
  observacaoAtiva = undefined;
  ativa.observer.disconnect();
  if (ativa.timerSilencio) {
    clearTimeout(ativa.timerSilencio);
  }
  clearTimeout(ativa.timerLimite);
  if (mudancaVisualRelevante(ativa.baseline, assinaturaVisual(document), ativa.encontrouMutacao)) {
    ativa.enviarMudanca(ativa.instanteApontar);
  }
}

/** Critério final: mutação agrupada + assinatura visual final diferente do baseline. */
export function mudancaVisualRelevante(baseline: string, atual: string, houveMutacao: boolean): boolean {
  return houveMutacao && baseline !== atual;
}

function mutacaoPodeAlterarTela(mutacao: MutationRecord): boolean {
  if (mutacao.type === "childList") {
    return mutacao.addedNodes.length > 0 || mutacao.removedNodes.length > 0;
  }
  if (mutacao.type === "characterData") {
    return elementoVisivel(mutacao.target.parentElement);
  }
  return elementoVisivel(mutacao.target as Element | null);
}

function assinaturaVisual(raiz: ParentNode): string {
  const partes: string[] = [];
  for (const elemento of raiz.querySelectorAll("*")) {
    if (!elementoVisivel(elemento)) {
      continue;
    }
    const classe = typeof elemento.className === "string" ? elemento.className : "";
    const texto = elemento instanceof HTMLInputElement || elemento instanceof HTMLTextAreaElement
      ? ""
      : hashLocal(elemento.textContent ?? "");
    const retangulo = elemento.getBoundingClientRect();
    partes.push([
      elemento.tagName,
      elemento.id ? "id" : "",
      elemento.getAttribute("role") ?? "",
      elemento.getAttribute("aria-expanded") ?? "",
      elemento.getAttribute("aria-hidden") ?? "",
      elemento instanceof HTMLElement && elemento.hidden ? "hidden" : "",
      classe,
      Math.round(retangulo.x),
      Math.round(retangulo.y),
      Math.round(retangulo.width),
      Math.round(retangulo.height),
      texto,
    ].join("|"));
  }
  return partes.join(";");
}

function elementoVisivel(elemento: Element | null): boolean {
  if (!elemento) {
    return false;
  }
  const estilo = getComputedStyle(elemento);
  return estilo.display !== "none" && estilo.visibility !== "hidden" && elemento.getClientRects().length > 0;
}

function hashLocal(valor: string): string {
  let hash = 2166136261;
  for (let indice = 0; indice < valor.length; indice += 1) {
    hash ^= valor.charCodeAt(indice);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
}
