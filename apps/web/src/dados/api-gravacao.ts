import type { PassoGravado } from "@/dominio/tipos";

/** Base da API do PassoGuia. Sem auth nesta etapa. */
export const URL_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";
/** sessaoId fixo desta prova — combinado com a extensão. */
export const SESSAO_PROVA = "prova-local";

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
}

function normalizarPasso(bruto: unknown): PassoGravado {
  const registro = (bruto ?? {}) as Record<string, unknown>;
  const imagemRedigida = texto(registro.imagemRedigida);
  const descricao = texto(registro.descricao);
  const correlacaoId = texto(registro.correlacaoId);
  return {
    id: texto(registro.id) ?? correlacaoId ?? crypto.randomUUID(),
    ordem: typeof registro.ordem === "number" ? registro.ordem : 0,
    titulo: texto(registro.titulo) ?? "Passo",
    origem: "automatico",
    ...(descricao ? { descricao } : {}),
    ...(imagemRedigida ? { imagemRedigida } : {}),
    ...(typeof registro.redacaoIncompleta === "boolean"
      ? { redacaoIncompleta: registro.redacaoIncompleta }
      : {}),
    ...(correlacaoId ? { correlacaoId } : {}),
  };
}

/** Carrega os passos já registrados na sessão (GET). */
export async function carregarPassos(): Promise<PassoGravado[]> {
  try {
    const resposta = await fetch(`${URL_API}/sessoes/${SESSAO_PROVA}/passos`, {
      cache: "no-store",
    });
    if (!resposta.ok) {
      return [];
    }
    const bruto: unknown = await resposta.json();
    return Array.isArray(bruto) ? bruto.map(normalizarPasso) : [];
  } catch {
    return [];
  }
}

/** Assina os passos novos da sessão via SSE. Devolve uma função para fechar a conexão. */
export function abrirFluxoDePassos(aoReceber: (passo: PassoGravado) => void): () => void {
  const fonte = new EventSource(`${URL_API}/sessoes/${SESSAO_PROVA}/eventos`);
  fonte.onmessage = (evento) => {
    try {
      aoReceber(normalizarPasso(JSON.parse(evento.data) as unknown));
    } catch {
      // payload malformado — ignora este evento
    }
  };
  return () => {
    fonte.close();
  };
}
