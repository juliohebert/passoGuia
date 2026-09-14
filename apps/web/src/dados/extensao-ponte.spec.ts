import { afterEach, describe, expect, it, vi } from "vitest";
import { enviarSessaoParaExtensao } from "./extensao-ponte";

const ID_EXTENSAO_PADRAO = "iljkehaockedckdhblplmpkagjabfdbm";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("enviarSessaoParaExtensao — entrega direta do sessaoId da web para a extensão", () => {
  it("devolve true quando a extensão confirma ter persistido o sessaoId", async () => {
    const sendMessage = vi.fn((idExtensao: string, mensagem: unknown, callback: (r: unknown) => void) => {
      expect(idExtensao).toBe(ID_EXTENSAO_PADRAO);
      expect(mensagem).toEqual({ tipo: "definir-sessao-ativa", sessaoId: "sessao-real-123" });
      callback({ ok: true });
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    expect(await enviarSessaoParaExtensao("sessao-real-123")).toBe(true);
  });

  it("devolve false quando não há `chrome` no navegador (extensão não instalada / navegador sem suporte)", async () => {
    vi.stubGlobal("chrome", undefined);
    expect(await enviarSessaoParaExtensao("sessao-1")).toBe(false);
  });

  it("devolve false quando `chrome.runtime.sendMessage` não existe", async () => {
    vi.stubGlobal("chrome", { runtime: {} });
    expect(await enviarSessaoParaExtensao("sessao-1")).toBe(false);
  });

  it("devolve false quando a extensão não está instalada (chrome.runtime.lastError)", async () => {
    const runtime = {
      lastError: undefined as { message?: string } | undefined,
      sendMessage: vi.fn((_id: string, _msg: unknown, callback: (r: unknown) => void) => {
        runtime.lastError = { message: "Could not establish connection. Receiving end does not exist." };
        callback(undefined);
      }),
    };
    vi.stubGlobal("chrome", { runtime });

    expect(await enviarSessaoParaExtensao("sessao-1")).toBe(false);
  });

  it("devolve false quando a extensão responde sem ok:true", async () => {
    const sendMessage = vi.fn((_id: string, _msg: unknown, callback: (r: unknown) => void) => {
      callback({ ok: false });
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    expect(await enviarSessaoParaExtensao("sessao-1")).toBe(false);
  });

  it("devolve false se sendMessage lançar sincronamente", async () => {
    const sendMessage = vi.fn(() => {
      throw new Error("erro inesperado");
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    expect(await enviarSessaoParaExtensao("sessao-1")).toBe(false);
  });

  it("nunca lança — resolve false mesmo em cenários inesperados", async () => {
    vi.stubGlobal("chrome", { runtime: { sendMessage: "não é uma função" } });
    await expect(enviarSessaoParaExtensao("sessao-1")).resolves.toBe(false);
  });

  it("devolve false por timeout se a extensão nunca responder (nunca trava a tela)", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(() => {
      // nunca chama o callback — simula extensão travada/sem resposta.
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    const promessa = enviarSessaoParaExtensao("sessao-1");
    await vi.runAllTimersAsync();

    expect(await promessa).toBe(false);
    vi.useRealTimers();
  });
});
