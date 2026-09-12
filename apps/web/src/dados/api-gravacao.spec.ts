import { afterEach, describe, expect, it, vi } from "vitest";
import { carregarPassos } from "./api-gravacao";

function mockFetchJson(corpo: unknown, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(corpo),
    }),
  );
}

describe("carregarPassos / normalização", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normaliza um passo válido vindo da API", async () => {
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
    expect(passo?.correlacaoId).toBe("c1");
  });

  it("resposta não-ok do GET devolve lista vazia (nunca lança)", async () => {
    mockFetchJson([], false);
    expect(await carregarPassos()).toEqual([]);
  });
});
