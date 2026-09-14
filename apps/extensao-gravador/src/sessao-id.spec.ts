import { afterEach, describe, expect, it, vi } from "vitest";
import { lerSessaoId, limparSessaoId, persistirSessaoId } from "./sessao-id";

function mockChromeStorageSession(dados: Record<string, unknown> = {}) {
  const armazenado: Record<string, unknown> = { ...dados };
  const set = vi.fn((valores: Record<string, unknown>) => {
    Object.assign(armazenado, valores);
    return Promise.resolve();
  });
  const get = vi.fn((chave: string) =>
    Promise.resolve(chave in armazenado ? { [chave]: armazenado[chave] } : {}),
  );
  const remove = vi.fn((chave: string) => {
    delete armazenado[chave];
    return Promise.resolve();
  });
  vi.stubGlobal("chrome", { storage: { session: { get, set, remove } } });
  return { armazenado, get, set, remove };
}

describe("persistirSessaoId / lerSessaoId / limparSessaoId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persiste e lê de volta — sobrevive a um 'reinício' (novo processo lendo o mesmo storage)", async () => {
    const { armazenado } = mockChromeStorageSession();

    await persistirSessaoId("sessao-123");
    expect(armazenado.sessaoIdAtiva).toBe("sessao-123");

    expect(await lerSessaoId()).toBe("sessao-123");
  });

  it("nada persistido: devolve undefined", async () => {
    mockChromeStorageSession();
    expect(await lerSessaoId()).toBeUndefined();
  });

  it("valor persistido inválido (não string / vazio): devolve undefined, nunca lança", async () => {
    mockChromeStorageSession({ sessaoIdAtiva: 123 });
    expect(await lerSessaoId()).toBeUndefined();

    mockChromeStorageSession({ sessaoIdAtiva: "   " });
    expect(await lerSessaoId()).toBeUndefined();
  });

  it("limpar remove o valor — depois disso, ler devolve undefined", async () => {
    const { armazenado } = mockChromeStorageSession({ sessaoIdAtiva: "sessao-123" });

    await limparSessaoId();

    expect(armazenado.sessaoIdAtiva).toBeUndefined();
    expect(await lerSessaoId()).toBeUndefined();
  });

  it("nunca lança — falha da API de storage em qualquer operação", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        session: {
          get: vi.fn().mockRejectedValue(new Error("falha")),
          set: vi.fn().mockRejectedValue(new Error("falha")),
          remove: vi.fn().mockRejectedValue(new Error("falha")),
        },
      },
    });

    await expect(persistirSessaoId("sessao-123")).resolves.toBeUndefined();
    await expect(lerSessaoId()).resolves.toBeUndefined();
    await expect(limparSessaoId()).resolves.toBeUndefined();
  });
});
