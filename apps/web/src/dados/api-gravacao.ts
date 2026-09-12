import type {
  AnotacaoImagem,
  ConfiancaSugestao,
  GeometriaAnotacao,
  MascaraAplicada,
  OrigemMascara,
  PassoGravado,
  SugestaoMascara,
  TipoAnotacao,
} from "@/dominio/tipos";

/** Base da API do PassoGuia. Sem auth nesta etapa. */
export const URL_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";
/** sessaoId fixo desta prova — combinado com a extensão. */
export const SESSAO_PROVA = "prova-local";

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
}

function numero(valor: unknown): number | undefined {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : undefined;
}

function ehConfianca(valor: unknown): valor is ConfiancaSugestao {
  return valor === "alta" || valor === "baixa";
}

function ehOrigemMascara(valor: unknown): valor is OrigemMascara {
  return valor === "sugestao" || valor === "manual";
}

/** Whitelist estrita: nunca repassa campos desconhecidos vindos da API. */
function normalizarMascarasAplicadas(valor: unknown): MascaraAplicada[] | undefined {
  if (!Array.isArray(valor)) {
    return undefined;
  }
  const mascaras: MascaraAplicada[] = [];
  for (const item of valor) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const m = item as Record<string, unknown>;
    const id = texto(m.id);
    const x = numero(m.x);
    const y = numero(m.y);
    const largura = numero(m.largura);
    const altura = numero(m.altura);
    if (
      !id ||
      x === undefined ||
      y === undefined ||
      !largura ||
      !altura ||
      !ehOrigemMascara(m.origem) ||
      typeof m.ativa !== "boolean"
    ) {
      continue;
    }
    mascaras.push({ id, x, y, largura, altura, origem: m.origem, ativa: m.ativa });
  }
  return mascaras;
}

/** Whitelist estrita: só geometria + motivo/confiança — nunca repassa campos desconhecidos (defesa contra payload inesperado). */
function normalizarSugestoesMascara(valor: unknown): SugestaoMascara[] | undefined {
  if (!Array.isArray(valor)) {
    return undefined;
  }
  const sugestoes: SugestaoMascara[] = [];
  for (const item of valor) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const s = item as Record<string, unknown>;
    const x = numero(s.x);
    const y = numero(s.y);
    const largura = numero(s.largura);
    const altura = numero(s.altura);
    const motivo = texto(s.motivo);
    if (x === undefined || y === undefined || !largura || !altura || !motivo || !ehConfianca(s.confianca)) {
      continue;
    }
    sugestoes.push({ x, y, largura, altura, motivo, confianca: s.confianca });
  }
  return sugestoes;
}

const TIPOS_ANOTACAO_VALIDOS = new Set<TipoAnotacao>(["mascara", "destaque", "seta", "numero"]);

function ehTipoAnotacao(valor: unknown): valor is TipoAnotacao {
  return typeof valor === "string" && TIPOS_ANOTACAO_VALIDOS.has(valor as TipoAnotacao);
}

/** Geometria conforme o tipo — descarta a anotação inteira se não bater (nunca aceita formato errado). */
function normalizarGeometriaAnotacao(tipo: TipoAnotacao, valor: unknown): GeometriaAnotacao | undefined {
  if (typeof valor !== "object" || valor === null) {
    return undefined;
  }
  const g = valor as Record<string, unknown>;

  if (tipo === "mascara" || tipo === "destaque") {
    const x = numero(g.x);
    const y = numero(g.y);
    const largura = numero(g.largura);
    const altura = numero(g.altura);
    if (g.tipo !== "retangulo" || x === undefined || y === undefined || !largura || !altura) {
      return undefined;
    }
    return { tipo: "retangulo", x, y, largura, altura };
  }

  if (tipo === "seta") {
    const x1 = numero(g.x1);
    const y1 = numero(g.y1);
    const x2 = numero(g.x2);
    const y2 = numero(g.y2);
    if (g.tipo !== "seta" || x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
      return undefined;
    }
    return { tipo: "seta", x1, y1, x2, y2 };
  }

  // numero
  const x = numero(g.x);
  const y = numero(g.y);
  if (g.tipo !== "ponto" || x === undefined || y === undefined) {
    return undefined;
  }
  return { tipo: "ponto", x, y };
}

/** Whitelist estrita: geometria conforme o tipo, nunca repassa campos desconhecidos. */
function normalizarAnotacoesImagem(valor: unknown): AnotacaoImagem[] | undefined {
  if (!Array.isArray(valor)) {
    return undefined;
  }
  const anotacoes: AnotacaoImagem[] = [];
  for (const item of valor) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const a = item as Record<string, unknown>;
    const id = texto(a.id);
    if (!id || !ehTipoAnotacao(a.tipo)) {
      continue;
    }
    const geometria = normalizarGeometriaAnotacao(a.tipo, a.geometria);
    if (!geometria) {
      continue;
    }
    if (a.tipo === "numero") {
      const ordem = numero(a.ordem);
      if (ordem === undefined) {
        continue;
      }
      anotacoes.push({ id, tipo: a.tipo, geometria, ordem });
    } else {
      anotacoes.push({ id, tipo: a.tipo, geometria });
    }
  }
  return anotacoes;
}

function normalizarPasso(bruto: unknown): PassoGravado {
  const registro = (bruto ?? {}) as Record<string, unknown>;
  const imagemRedigida = texto(registro.imagemRedigida);
  const descricao = texto(registro.descricao);
  const sugestoesMascara = normalizarSugestoesMascara(registro.sugestoesMascara);
  const mascarasAplicadas = normalizarMascarasAplicadas(registro.mascarasAplicadas);
  const anotacoesImagem = normalizarAnotacoesImagem(registro.anotacoesImagem);
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
    ...(typeof registro.revisaoPrivacidadeNecessaria === "boolean"
      ? { revisaoPrivacidadeNecessaria: registro.revisaoPrivacidadeNecessaria }
      : {}),
    ...(sugestoesMascara ? { sugestoesMascara } : {}),
    ...(mascarasAplicadas ? { mascarasAplicadas } : {}),
    ...(anotacoesImagem ? { anotacoesImagem } : {}),
    ...(correlacaoId ? { correlacaoId } : {}),
  };
}

/**
 * Combina o snapshot do GET com os passos já acumulados no estado (ex.: já
 * chegaram via SSE antes do GET terminar). NUNCA substitui o estado cru
 * (`setAutomaticos(passos)`): o GET é assíncrono e pode responder DEPOIS que
 * o SSE já entregou passos mais recentes — sobrescrever descartaria esses
 * passos, mesmo já tendo sido gerados e enviados corretamente pela extensão
 * (causa raiz de "nem todos os cliques rápidos aparecem" na tela /gravacao,
 * um bug de renderização da web, não de captura). Preserva qualquer passo em
 * `atuais` que não esteja no snapshot do GET; o GET é a fonte de verdade
 * para os que aparecem nos dois.
 */
export function mesclarPassos(doGet: PassoGravado[], atuais: PassoGravado[]): PassoGravado[] {
  const porId = new Map(doGet.map((p) => [p.id, p]));
  for (const p of atuais) {
    if (!porId.has(p.id)) {
      porId.set(p.id, p);
    }
  }
  return [...porId.values()];
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

/**
 * Salva a lista DEFINITIVA de máscaras de um passo (editor manual de
 * privacidade) — substitui a lista inteira no backend. `null` em caso de
 * falha (rede, passo não encontrado, validação): quem chama decide como
 * avisar o usuário, a UI não assume sucesso silenciosamente.
 */
export async function salvarMascaras(
  correlacaoId: string,
  mascaras: MascaraAplicada[],
): Promise<PassoGravado | null> {
  try {
    const resposta = await fetch(
      `${URL_API}/sessoes/${SESSAO_PROVA}/passos/${encodeURIComponent(correlacaoId)}/mascaras`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mascaras),
      },
    );
    if (!resposta.ok) {
      return null;
    }
    return normalizarPasso(await resposta.json());
  } catch {
    return null;
  }
}

/**
 * Salva a lista DEFINITIVA de anotações de um passo (editor de imagem:
 * máscara/destaque/seta/número) — substitui a lista inteira no backend.
 * `null` em caso de falha (rede, passo não encontrado, validação): quem
 * chama decide como avisar o usuário, a UI não assume sucesso silenciosamente.
 */
export async function salvarAnotacoes(
  correlacaoId: string,
  anotacoes: AnotacaoImagem[],
): Promise<PassoGravado | null> {
  try {
    const resposta = await fetch(
      `${URL_API}/sessoes/${SESSAO_PROVA}/passos/${encodeURIComponent(correlacaoId)}/anotacoes`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(anotacoes),
      },
    );
    if (!resposta.ok) {
      return null;
    }
    return normalizarPasso(await resposta.json());
  } catch {
    return null;
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
