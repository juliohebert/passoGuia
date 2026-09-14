import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  capturarFrameAtual,
  iniciarCapturaStream,
  pararCapturaStream,
} from "./captura-stream";

describe("captura-stream", () => {
  let enviar: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    enviar = vi.fn().mockImplementation(async (mensagem: { acao: string }) => {
      if (mensagem.acao === "frame") {
        return { ok: true, dataUrl: "data:image/jpeg;base64,c3RlcA==" };
      }
      return { ok: true };
    });
    vi.stubGlobal("chrome", {
      tabCapture: { getMediaStreamId: vi.fn().mockResolvedValue("stream-id") },
      runtime: {
        getURL: vi.fn().mockReturnValue("chrome-extension://teste/offscreen.html"),
        getContexts: vi.fn().mockResolvedValue([]),
        sendMessage: enviar,
      },
      offscreen: {
        createDocument: vi.fn().mockResolvedValue(undefined),
        closeDocument: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(async () => {
    await pararCapturaStream();
    vi.unstubAllGlobals();
  });

  it("inicia a stream com getMediaStreamId e cria o offscreen", async () => {
    await expect(iniciarCapturaStream(42)).resolves.toBe(true);
    expect(chrome.tabCapture.getMediaStreamId).toHaveBeenCalledWith({ targetTabId: 42 });
    expect(chrome.offscreen.createDocument).toHaveBeenCalledWith({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: expect.any(String),
    });
    expect(enviar).toHaveBeenCalledWith({ tipo: "captura-stream", acao: "iniciar", streamId: "stream-id" });
  });

  it("extrai frames atuais sem depender da origem da aba", async () => {
    await iniciarCapturaStream(42);

    const frames = await Promise.all([capturarFrameAtual(), capturarFrameAtual()]);

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ formato: "jpeg", dataUrl: expect.stringContaining("data:image/jpeg") });
    expect(enviar).toHaveBeenCalledTimes(3);
  });

  it("encerra a stream e fecha o documento offscreen", async () => {
    await iniciarCapturaStream(42);
    await pararCapturaStream();

    expect(enviar).toHaveBeenLastCalledWith({ tipo: "captura-stream", acao: "parar" });
    expect(chrome.offscreen.closeDocument).toHaveBeenCalled();
    await expect(capturarFrameAtual()).resolves.toBeNull();
  });
});
