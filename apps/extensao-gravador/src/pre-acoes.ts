/**
 * Buffer de PRE-AÇÕES em voo por aba — puro (sem estado de módulo), testável
 * isoladamente sem mock de `chrome.*`.
 *
 * Corrige a race "click chega e o passo é consolidado antes do PRE
 * terminar, perdendo o screenshot": o desenho antigo guardava só UM slot por
 * aba (`Map<tabId, PreAcao>`). Como o pointerdown inicia a captura PRE de
 * forma assíncrona, um segundo pointerdown (próximo clique rápido na mesma
 * tela) podia sobrescrever esse slot ANTES do primeiro clique consumir a
 * SUA própria captura — perdendo a referência e caindo em "sem pré-ação
 * registrada". Aqui cada PRE-AÇÃO entra num buffer por aba e só é REMOVIDA
 * quando o clique que a originou a reclama por match EXATO de
 * `instanteApontar` (nunca "a mais recente da aba") — cliques concorrentes
 * não se atropelam. `podarPreAcoes` limita o buffer por idade (TTL) e
 * tamanho, para nunca vazar memória com pointerdowns que nunca fecharam um
 * clique (ex.: abortados por drag) — a poda roda a cada inserção/consulta,
 * nunca depende de navegação para acontecer.
 */
export interface PreAcaoBase {
  instanteApontar: number;
  criadoEm: number;
}

/** Remove entradas mais velhas que `ttlMs` e trunca ao máximo `maxPendentes` (descarta as mais antigas primeiro). */
export function podarPreAcoes<T extends PreAcaoBase>(
  buffer: Map<number, T[]>,
  tabId: number,
  maxPendentes: number,
  ttlMs: number,
  agora: number = Date.now(),
): void {
  const lista = buffer.get(tabId);
  if (!lista) {
    return;
  }
  const viva = lista.filter((p) => agora - p.criadoEm <= ttlMs);
  while (viva.length > maxPendentes) {
    viva.shift();
  }
  if (viva.length === 0) {
    buffer.delete(tabId);
  } else {
    buffer.set(tabId, viva);
  }
}

/** Adiciona ao buffer da aba e poda em seguida (idade + tamanho). */
export function adicionarPreAcao<T extends PreAcaoBase>(
  buffer: Map<number, T[]>,
  tabId: number,
  entrada: T,
  maxPendentes: number,
  ttlMs: number,
): void {
  const lista = buffer.get(tabId) ?? [];
  lista.push(entrada);
  buffer.set(tabId, lista);
  podarPreAcoes(buffer, tabId, maxPendentes, ttlMs);
}

/**
 * Acha a PRE-AÇÃO deste clique especificamente (match exato por
 * `instanteApontar`) e a REMOVE do buffer — nunca mexe nas entradas irmãs
 * (de outros cliques ainda em voo). `undefined` quando não há match: clique
 * sem pointerdown correspondente (ex.: acionado via teclado) ou PRE-AÇÃO já
 * podada por TTL.
 */
export function localizarEConsumirPreAcao<T extends PreAcaoBase>(
  buffer: Map<number, T[]>,
  tabId: number,
  instanteApontar: number,
): T | undefined {
  const lista = buffer.get(tabId);
  if (!lista) {
    return undefined;
  }
  const idx = lista.findIndex((p) => p.instanteApontar === instanteApontar);
  if (idx < 0) {
    return undefined;
  }
  const [pre] = lista.splice(idx, 1);
  if (lista.length === 0) {
    buffer.delete(tabId);
  }
  return pre;
}

/**
 * Espera `p` por no máximo `ms`. Nunca lança e nunca trava o resto do
 * recorder: o timeout é um setTimeout independente correndo em paralelo —
 * outras mensagens/passos continuam sendo processados normalmente enquanto
 * este await específico aguarda. `expirou=true` quando o timeout venceu
 * antes de `p` resolver.
 */
export function aguardarComTimeout<T>(
  p: Promise<T>,
  ms: number,
): Promise<{ valor: T | null; expirou: boolean }> {
  return new Promise((resolve) => {
    let resolvido = false;
    const timer = setTimeout(() => {
      if (resolvido) {
        return;
      }
      resolvido = true;
      resolve({ valor: null, expirou: true });
    }, ms);
    p.then((valor) => {
      if (resolvido) {
        return;
      }
      resolvido = true;
      clearTimeout(timer);
      resolve({ valor, expirou: false });
    }).catch(() => {
      if (resolvido) {
        return;
      }
      resolvido = true;
      clearTimeout(timer);
      resolve({ valor: null, expirou: false });
    });
  });
}
