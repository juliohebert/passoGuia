import { afterEach, describe, expect, it, vi } from "vitest";
import { carregarPassos, mesclarPassos, salvarMascaras } from "./api-gravacao";
import type { PassoGravado } from "@/dominio/tipos";

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

    const [passo] = await carregarPassos();

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

    const [passo] = await carregarPassos();

    expect(passo?.sugestoesMascara).toHaveLength(1);
    expect(passo?.mascarasAplicadas).toEqual([
      { id: "m1", x: 1, y: 2, largura: 3, altura: 4, origem: "manual", ativa: true },
    ]);
  });

  it("mascarasAplicadas=[] (usuário removeu todas) é preservado como lista vazia, não vira undefined", async () => {
    mockFetchJson([{ id: "p1", correlacaoId: "c1", ordem: 1, titulo: "Passo", mascarasAplicadas: [] }]);

    const [passo] = await carregarPassos();

    expect(passo?.mascarasAplicadas).toEqual([]);
  });

  it("resposta não-ok do GET devolve lista vazia (nunca lança)", async () => {
    mockFetchJson([], false);
    expect(await carregarPassos()).toEqual([]);
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

    const resultado = await salvarMascaras("c1", [
      { id: "m1", x: 1, y: 2, largura: 3, altura: 4, origem: "manual", ativa: true },
    ]);

    expect(resultado?.mascarasAplicadas).toHaveLength(1);
    const [url, opcoes] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/passos/c1/mascaras");
    expect(opcoes.method).toBe("PATCH");
  });

  it("devolve null quando a API responde com erro (não lança)", async () => {
    mockFetchJson({}, false);
    expect(await salvarMascaras("c1", [])).toBeNull();
  });

  it("devolve null em falha de rede (não lança)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    expect(await salvarMascaras("c1", [])).toBeNull();
  });
});
