import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ehSessaoAtivaPersistidaValida,
  lerSessaoAtivaPersistida,
  limparSessaoAtivaPersistida,
  persistirSessaoAtiva,
  type SessaoAtivaPersistida,
} from "./sessao-persistida";

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

describe("ehSessaoAtivaPersistidaValida", () => {
  it("aceita um formato válido", () => {
    expect(
      ehSessaoAtivaPersistidaValida({
        tabId: 1,
        windowId: 2,
        sitesAutorizados: ["https://ng.quarkclinic.com.br"],
        pausada: false,
      }),
    ).toBe(true);
  });

  it("aceita lista de sites autorizados vazia (nenhum site autorizado ainda)", () => {
    expect(
      ehSessaoAtivaPersistidaValida({ tabId: 1, windowId: 2, sitesAutorizados: [], pausada: true }),
    ).toBe(true);
  });

  it("rejeita undefined/null/tipos errados/campos faltando", () => {
    expect(ehSessaoAtivaPersistidaValida(undefined)).toBe(false);
    expect(ehSessaoAtivaPersistidaValida(null)).toBe(false);
    expect(ehSessaoAtivaPersistidaValida("string")).toBe(false);
    expect(
      ehSessaoAtivaPersistidaValida({ tabId: "1", windowId: 2, sitesAutorizados: [], pausada: false }),
    ).toBe(false);
    expect(ehSessaoAtivaPersistidaValida({ tabId: 1, windowId: 2 })).toBe(false);
    expect(ehSessaoAtivaPersistidaValida({})).toBe(false);
    expect(
      ehSessaoAtivaPersistidaValida({ tabId: 1, windowId: 2, sitesAutorizados: [1, 2], pausada: false }),
    ).toBe(false);
    expect(
      ehSessaoAtivaPersistidaValida({ tabId: 1, windowId: 2, sitesAutorizados: [], pausada: "não" }),
    ).toBe(false);
  });
});

describe("persistirSessaoAtiva / lerSessaoAtivaPersistida / limparSessaoAtivaPersistida", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sessao: SessaoAtivaPersistida = {
    tabId: 42,
    windowId: 7,
    sitesAutorizados: ["https://ng.quarkclinic.com.br"],
    pausada: false,
  };

  it("persiste e lê de volta exatamente o que foi salvo — sobrevive a um 'reinício' (novo processo lendo o mesmo storage)", async () => {
    const { armazenado } = mockChromeStorageSession();

    await persistirSessaoAtiva(sessao);
    // Simula reinício do service worker: nenhuma variável em memória deste
    // teste é reaproveitada — só o que está em `armazenado` (chrome.storage.session).
    expect(armazenado.sessaoAtivaPersistida).toEqual(sessao);

    const lida = await lerSessaoAtivaPersistida();
    expect(lida).toEqual(sessao);
  });

  it("nada persistido: devolve undefined", async () => {
    mockChromeStorageSession();
    expect(await lerSessaoAtivaPersistida()).toBeUndefined();
  });

  it("valor persistido corrompido/formato antigo: devolve undefined, nunca lança", async () => {
    mockChromeStorageSession({ sessaoAtivaPersistida: { tabId: "não é número" } });
    expect(await lerSessaoAtivaPersistida()).toBeUndefined();
  });

  it("limpar remove o valor — depois disso, ler devolve undefined", async () => {
    const { armazenado } = mockChromeStorageSession({ sessaoAtivaPersistida: sessao });

    await limparSessaoAtivaPersistida();

    expect(armazenado.sessaoAtivaPersistida).toBeUndefined();
    expect(await lerSessaoAtivaPersistida()).toBeUndefined();
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

    await expect(persistirSessaoAtiva(sessao)).resolves.toBeUndefined();
    await expect(lerSessaoAtivaPersistida()).resolves.toBeUndefined();
    await expect(limparSessaoAtivaPersistida()).resolves.toBeUndefined();
  });
});
