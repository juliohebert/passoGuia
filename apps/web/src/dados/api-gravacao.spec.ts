import { afterEach, describe, expect, it, vi } from "vitest";
import {
  atualizarTituloDescricao,
  buscarSessao,
  carregarPassos,
  criarPassoManual,
  criarSessao,
  excluirPasso,
  mesclarPassos,
  reordenarPassos,
  salvarMascaras,
} from "./api-gravacao";
import type { PassoGravado } from "@/dominio/tipos";

const SESSAO = "sessao-1";

function passo(id: string, ordem: number): PassoGravado {
  return { id, ordem, titulo: `Passo ${id}`, origem: "automatico" };
}

describe("mesclarPassos — causa raiz de cliques rápidos 'sumindo' na tela /gravacao", () => {
  it("GET atrasado NUNCA descarta passos que já chegaram via SSE antes dele resolver", () => {
    // Cenário real: 10 cliques rápidos. O GET (snapshot pego no mount) só viu
    // os 2 primeiros; enquanto isso, o SSE já entregou os passos 3..5 e foram
    // acumulados no estado local. setAutomaticos(passos) do GET sozinho
    // apagaria 3, 4 e 5 — mesclarPassos preserva os três.
    const doGet = [passo("1", 1), passo("2", 2)];
    const jaAcumuladosViaSSE = [passo("1", 1), passo("2", 2), passo("3", 3), passo("4", 4), passo("5", 5)];

    const resultado = mesclarPassos(doGet, jaAcumuladosViaSSE);

    expect(resultado.map((p) => p.id).sort()).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("GET mais atualizado que o estado local (SSE ainda não entregou tudo) inclui todos os novos", () => {
    const doGet = [passo("1", 1), passo("2", 2), passo("3", 3)];
    const atual = [passo("1", 1)];

    const resultado = mesclarPassos(doGet, atual);

    expect(resultado.map((p) => p.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("nunca duplica um passo presente nos dois lados", () => {
    const doGet = [passo("1", 1), passo("2", 2)];
    const atual = [passo("1", 1), passo("2", 2)];

    const resultado = mesclarPassos(doGet, atual);

    expect(resultado).toHaveLength(2);
  });

  it("sem nenhum passo em nenhum dos dois lados, devolve lista vazia", () => {
    expect(mesclarPassos([], [])).toEqual([]);
  });

  it("10 cliques rápidos: todos os 10 sobrevivem independente da ordem de chegada GET vs. SSE", () => {
    const todos = Array.from({ length: 10 }, (_, i) => passo(String(i + 1), i + 1));
    // Pior caso: GET só capturou a METADE (respondeu cedo, servidor ainda
    // processando os outros 5 cliques concorrentes); SSE já entregou todos os 10.
    const doGet = todos.slice(0, 5);
    const viaSSE = todos;

    const resultado = mesclarPassos(doGet, viaSSE);

    expect(resultado).toHaveLength(10);
    expect(resultado.map((p) => p.id).sort((a, b) => Number(a) - Number(b))).toEqual(
      todos.map((p) => p.id),
    );
  });
});

function mockFetchJson(corpo: unknown, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(corpo),
    }),
  );
}

describe("criarSessao — Novo manual", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("faz POST em /sessoes e devolve o resumo normalizado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sessaoId: "sessao-nova",
          nome: "Emitir nota fiscal",
          modo: "extensao",
          criadaEm: 1_700_000_000_000,
          totalPassos: 0,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await criarSessao({ nome: "Emitir nota fiscal" });

    expect(resultado?.sessaoId).toBe("sessao-nova");
    expect(resultado?.nome).toBe("Emitir nota fiscal");
    const [url, opcoes] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/sessoes");
    expect(opcoes.method).toBe("POST");
    expect(JSON.parse(opcoes.body as string)).toEqual({ nome: "Emitir nota fiscal" });
  });

  it("devolve null quando a API responde com erro (não lança)", async () => {
    mockFetchJson({}, false);
    expect(await criarSessao({ nome: "X" })).toBeNull();
  });

  it("devolve null em falha de rede (não lança)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await criarSessao({ nome: "X" })).toBeNull();
  });
});

describe("buscarSessao — detecção de sessão inexistente", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("faz GET em /sessoes/:id e devolve o resumo normalizado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sessaoId: SESSAO,
          nome: "Emitir nota fiscal",
          url: "https://sistema.exemplo.com",
          modo: "extensao",
          criadaEm: 1_700_000_000_000,
          totalPassos: 3,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await buscarSessao(SESSAO);

    expect(resultado?.sessaoId).toBe(SESSAO);
    expect(resultado?.url).toBe("https://sistema.exemplo.com");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain(`/sessoes/${SESSAO}`);
  });

  it("devolve null quando a sessão não existe (404) — nunca lança", async () => {
    mockFetchJson({}, false);
    expect(await buscarSessao("nao-existe")).toBeNull();
  });

  it("devolve null em falha de rede (não lança)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await buscarSessao(SESSAO)).toBeNull();
  });
});

describe("carregarPassos / normalização — compatibilidade com passos antigos e novos", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passo ANTIGO (sem sugestoesMascara, sem mascarasAplicadas) continua normalizando sem quebrar", async () => {
    mockFetchJson([
      {
        id: "p1",
        correlacaoId: "c1",
        ordem: 1,
        titulo: "Clique em Salvar",
        redacaoIncompleta: false,
      },
    ]);

    const [passo] = await carregarPassos(SESSAO);

    expect(passo?.titulo).toBe("Clique em Salvar");
    expect(passo?.sugestoesMascara).toBeUndefined();
    expect(passo?.mascarasAplicadas).toBeUndefined();
    expect(passo?.correlacaoId).toBe("c1");
  });

  it("normaliza sugestoesMascara e mascarasAplicadas quando presentes, descartando itens malformados", async () => {
    mockFetchJson([
      {
        id: "p1",
        correlacaoId: "c1",
        ordem: 1,
        titulo: "Passo",
        sugestoesMascara: [
          { x: 1, y: 2, largura: 3, altura: 4, motivo: "campo sensível", confianca: "alta" },
          { x: "invalido" }, // descartado
        ],
        mascarasAplicadas: [
          { id: "m1", x: 1, y: 2, largura: 3, altura: 4, origem: "manual", ativa: true },
          { id: "m2", origem: "manual" }, // sem geometria — descartado
        ],
      },
    ]);

    const [passo] = await carregarPassos(SESSAO);

    expect(passo?.sugestoesMascara).toHaveLength(1);
    expect(passo?.mascarasAplicadas).toEqual([
      { id: "m1", x: 1, y: 2, largura: 3, altura: 4, origem: "manual", ativa: true },
    ]);
  });

  it("mascarasAplicadas=[] (usuário removeu todas) é preservado como lista vazia, não vira undefined", async () => {
    mockFetchJson([{ id: "p1", correlacaoId: "c1", ordem: 1, titulo: "Passo", mascarasAplicadas: [] }]);

    const [passo] = await carregarPassos(SESSAO);

    expect(passo?.mascarasAplicadas).toEqual([]);
  });

  it("resposta não-ok do GET devolve lista vazia (nunca lança)", async () => {
    mockFetchJson([], false);
    expect(await carregarPassos(SESSAO)).toEqual([]);
  });

  it("normaliza origem 'manual' vinda da API (passo manual do Editor do Manual)", async () => {
    mockFetchJson([{ id: "p1", correlacaoId: "c1", ordem: 1, titulo: "Passo manual", origem: "manual" }]);
    const [passo] = await carregarPassos(SESSAO);
    expect(passo?.origem).toBe("manual");
  });

  it("qualquer origem diferente de 'manual' normaliza para 'automatico'", async () => {
    mockFetchJson([{ id: "p1", correlacaoId: "c1", ordem: 1, titulo: "Passo", origem: "lixo" }]);
    const [passo] = await carregarPassos(SESSAO);
    expect(passo?.origem).toBe("automatico");
  });
});

describe("salvarMascaras", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("faz PATCH para a rota de máscaras do passo e devolve o passo normalizado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "p1",
          correlacaoId: "c1",
          ordem: 1,
          titulo: "Passo",
          mascarasAplicadas: [{ id: "m1", x: 1, y: 2, largura: 3, altura: 4, origem: "manual", ativa: true }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await salvarMascaras(SESSAO, "c1", [
      { id: "m1", x: 1, y: 2, largura: 3, altura: 4, origem: "manual", ativa: true },
    ]);

    expect(resultado?.mascarasAplicadas).toHaveLength(1);
    const [url, opcoes] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/passos/c1/mascaras");
    expect(opcoes.method).toBe("PATCH");
  });

  it("devolve null quando a API responde com erro (não lança)", async () => {
    mockFetchJson({}, false);
    expect(await salvarMascaras(SESSAO, "c1", [])).toBeNull();
  });

  it("devolve null em falha de rede (não lança)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    expect(await salvarMascaras(SESSAO, "c1", [])).toBeNull();
  });
});

describe("criarPassoManual — Editor do Manual", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("faz POST em .../passos/manual e devolve o passo criado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ id: "p9", correlacaoId: "c9", ordem: 3, titulo: "Conferir", origem: "manual" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await criarPassoManual(SESSAO, "Conferir", "Descrição");

    expect(resultado?.origem).toBe("manual");
    expect(resultado?.imagemRedigida).toBeUndefined();
    const [url, opcoes] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/passos/manual");
    expect(opcoes.method).toBe("POST");
    expect(JSON.parse(opcoes.body as string)).toEqual({ titulo: "Conferir", descricao: "Descrição" });
  });

  it("descrição é opcional — não envia o campo quando ausente", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "p9", correlacaoId: "c9", ordem: 1, titulo: "Só título" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await criarPassoManual(SESSAO, "Só título");

    const [, opcoes] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(opcoes.body as string)).toEqual({ titulo: "Só título" });
  });

  it("devolve null quando a API responde com erro (não lança)", async () => {
    mockFetchJson({}, false);
    expect(await criarPassoManual(SESSAO, "X")).toBeNull();
  });
});

describe("atualizarTituloDescricao — Editor do Manual", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("faz PATCH em .../passos/:correlacaoId e devolve o passo normalizado", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "p1", correlacaoId: "c1", ordem: 1, titulo: "Editado" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await atualizarTituloDescricao(SESSAO, "c1", "Editado", "nova descrição");

    expect(resultado?.titulo).toBe("Editado");
    const [url, opcoes] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/passos/c1");
    expect(url).not.toContain("/mascaras");
    expect(url).not.toContain("/anotacoes");
    expect(opcoes.method).toBe("PATCH");
  });

  it("devolve null quando a API responde com erro (não lança)", async () => {
    mockFetchJson({}, false);
    expect(await atualizarTituloDescricao(SESSAO, "c1", "X")).toBeNull();
  });
});

describe("excluirPasso — Editor do Manual", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("faz DELETE em .../passos/:correlacaoId e devolve true em sucesso", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    expect(await excluirPasso(SESSAO, "c1")).toBe(true);
    const [url, opcoes] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/passos/c1");
    expect(opcoes.method).toBe("DELETE");
  });

  it("devolve false quando a API responde com erro (não lança)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await excluirPasso(SESSAO, "nao-existe")).toBe(false);
  });

  it("devolve false em falha de rede (não lança)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await excluirPasso(SESSAO, "c1")).toBe(false);
  });
});

describe("reordenarPassos — Editor do Manual", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("faz PATCH em .../passos/reordenar com a lista de correlacaoId e devolve os passos normalizados", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: "p2", correlacaoId: "c2", ordem: 1, titulo: "dois" },
          { id: "p1", correlacaoId: "c1", ordem: 2, titulo: "um" },
        ]),
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await reordenarPassos(SESSAO, ["c2", "c1"]);

    expect(resultado?.map((p) => p.correlacaoId)).toEqual(["c2", "c1"]);
    const [url, opcoes] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/passos/reordenar");
    expect(opcoes.method).toBe("PATCH");
    expect(JSON.parse(opcoes.body as string)).toEqual({ ordem: ["c2", "c1"] });
  });

  it("devolve null quando a API responde com erro (não lança)", async () => {
    mockFetchJson({}, false);
    expect(await reordenarPassos(SESSAO, ["c1"])).toBeNull();
  });
});
