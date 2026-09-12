import { afterEach, describe, expect, it, vi } from "vitest";
import { carregarPassos, salvarMascaras } from "./api-gravacao";

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
