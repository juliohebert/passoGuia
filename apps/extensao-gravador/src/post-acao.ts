const JANELA_NAVEGACAO_MS = 1200;
const LIMITE_NAVEGACAO_MS = 3000;

interface Pendente {
  instanteApontar: number;
  criadoEm: number;
  resolver: (motivo: MotivoPost) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type MotivoPost = false | "navegacao" | "mudanca";

const pendentesPorAba = new Map<number, Pendente[]>();
const ultimaNavegacaoSinalizada = new Map<number, number>();
const JANELA_DUPLICATA_NAVEGACAO_MS = 350;

/** Aguarda uma navegação causada pela ação, sem criar outra ação. */
export function aguardarPostAposNavegacao(tabId: number, instanteApontar: number): Promise<MotivoPost> {
  return new Promise((resolver) => {
    const timer = setTimeout(() => {
      removerPendente(tabId, pendente);
      resolver(false);
    }, JANELA_NAVEGACAO_MS);
    const pendente: Pendente = { criadoEm: Date.now(), instanteApontar, resolver, timer };
    const pendentes = pendentesPorAba.get(tabId) ?? [];
    pendentes.push(pendente);
    pendentesPorAba.set(tabId, pendentes);
  });
}

/** Sinaliza uma navegação relevante; no máximo um POST é disparado. */
export function sinalizarNavegacaoParaPost(tabId: number): void {
  const agora = Date.now();
  const ultima = ultimaNavegacaoSinalizada.get(tabId) ?? 0;
  if (agora - ultima < JANELA_DUPLICATA_NAVEGACAO_MS) {
    return;
  }
  const pendente = pendentesPorAba.get(tabId)?.[0];
  if (!pendente) {
    return;
  }
  ultimaNavegacaoSinalizada.set(tabId, agora);
  clearTimeout(pendente.timer);
  removerPendente(tabId, pendente);
  pendente.resolver("navegacao");
}

export function sinalizarMudancaPosAcao(tabId: number, instanteApontar: number): void {
  const pendente = pendentesPorAba.get(tabId)?.find((item) => item.instanteApontar === instanteApontar);
  if (!pendente) {
    return;
  }
  clearTimeout(pendente.timer);
  removerPendente(tabId, pendente);
  pendente.resolver("mudanca");
}

/** Mantém a espera aberta quando o Chrome já confirmou o início da navegação. */
export function registrarNavegacaoIniciada(tabId: number): void {
  const pendente = pendentesPorAba.get(tabId)?.[0];
  if (!pendente) {
    return;
  }
  clearTimeout(pendente.timer);
  pendente.timer = setTimeout(() => {
    removerPendente(tabId, pendente);
    pendente.resolver(false);
  }, LIMITE_NAVEGACAO_MS);
}

/** Apenas para isolar testes; a produção limpa entradas por timeout. */
export function limparPendenciasPost(): void {
  for (const [tabId, pendentes] of pendentesPorAba) {
    for (const pendente of pendentes) {
      clearTimeout(pendente.timer);
    }
    pendentesPorAba.delete(tabId);
  }
  ultimaNavegacaoSinalizada.clear();
}

function removerPendente(tabId: number, pendente: Pendente): void {
  const pendentes = pendentesPorAba.get(tabId);
  if (!pendentes) {
    return;
  }
  const restantes = pendentes.filter((item) => item !== pendente);
  if (restantes.length === 0) {
    pendentesPorAba.delete(tabId);
  } else {
    pendentesPorAba.set(tabId, restantes);
  }
}
