import { afterEach, describe, expect, it, vi } from "vitest";
import { iniciarPonteWeb } from "./ponte-web";

type Ouvinte = (
  mensagem: unknown,
  remetente: unknown,
  sendResponse: (resposta: unknown) => void,
) => boolean | void;

function mockChromeStorageSession() {
  const armazenado: Record<string, unknown> = {};
  vi.stubGlobal("chrome", {
    storage: {
      session: {
        set: vi.fn((valores: Record<string, unknown>) => {
          Object.assign(armazenado, valores);
          return Promise.resolve();
        }),
      },
    },
    runtime: {
      onMessageExternal: {
        addListener: vi.fn(),
      },
    },
  });
  return armazenado;
}

function capturarOuvinte(): Ouvinte {
  iniciarPonteWeb();
  const chromeGlobal = (globalThis as unknown as { chrome: { runtime: { onMessageExternal: { addListener: ReturnType<typeof vi.fn> } } } }).chrome;
  const chamada = chromeGlobal.runtime.onMessageExternal.addListener.mock.calls[0] as [Ouvinte];
  return chamada[0];
}

describe("iniciarPonteWeb — web entrega o sessaoId DIRETAMENTE à extensão (chrome.runtime.onMessageExternal)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recebe 'definir-sessao-ativa' e persiste o sessaoId em chrome.storage.session", async () => {
    const armazenado = mockChromeStorageSession();
    const ouvinte = capturarOuvinte();

    const sendResponse = vi.fn();
    const continuaAssincrono = ouvinte({ tipo: "definir-sessao-ativa", sessaoId: "sessao-abc" }, {}, sendResponse);

    expect(continuaAssincrono).toBe(true); // mantém o canal aberto para a resposta assíncrona
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({ ok: true });
    });
    expect(armazenado.sessaoIdAtiva).toBe("sessao-abc");
  });

  it("sessaoId ausente/vazio/inválido: responde ok:false, nunca persiste", () => {
    const armazenado = mockChromeStorageSession();
    const ouvinte = capturarOuvinte();

    const sendResponse = vi.fn();
    expect(ouvinte({ tipo: "definir-sessao-ativa", sessaoId: "" }, {}, sendResponse)).toBe(false);
    expect(ouvinte({ tipo: "definir-sessao-ativa" }, {}, sendResponse)).toBe(false);
    expect(ouvinte({ tipo: "definir-sessao-ativa", sessaoId: 123 }, {}, sendResponse)).toBe(false);

    expect(sendResponse).toHaveBeenCalledWith({ ok: false });
    expect(armazenado.sessaoIdAtiva).toBeUndefined();
  });

  it("ignora mensagens de outro tipo — nunca interfere com outras mensagens externas", () => {
    mockChromeStorageSession();
    const ouvinte = capturarOuvinte();

    const sendResponse = vi.fn();
    const resultado = ouvinte({ tipo: "algo-nao-relacionado" }, {}, sendResponse);

    expect(resultado).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it("ignora payload que não é um objeto com tipo", () => {
    mockChromeStorageSession();
    const ouvinte = capturarOuvinte();

    const sendResponse = vi.fn();
    expect(ouvinte(null, {}, sendResponse)).toBe(false);
    expect(ouvinte("string-solta", {}, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
