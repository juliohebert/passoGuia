import { afterEach, describe, expect, it, vi } from "vitest";
import { enviarPasso, MAX_IMAGEM_BYTES, type PassoParaApi } from "./envio-api";

const base: PassoParaApi = {
  correlacaoId: "abc-123",
  tipoAcao: "CLIQUE",
  titulo: "Clique em Salvar",
  descricao: "Clique em Salvar.",
  redacaoIncompleta: false,
  revisaoPrivacidadeNecessaria: false,
  ocorridoEm: 1_700_000_000_000,
};

function respostaOk(): Response {
  return { ok: true, status: 200, text: async () => "" } as Response;
}

function resposta413(): Response {
  return { ok: false, status: 413, text: async () => "payload too large" } as Response;
}

function corpoEnviado(chamada: unknown[] | undefined): PassoParaApi {
  if (!chamada) {
    throw new Error("fetch não foi chamado");
  }
  const init = chamada[1] as { body: string };
  return JSON.parse(init.body) as PassoParaApi;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("enviarPasso", () => {
  it("envia a imagem quando ela está dentro do limite", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk());
    vi.stubGlobal("fetch", fetchMock);

    const imagemRedigida = `data:image/jpeg;base64,${"A".repeat(1000)}`;
    await enviarPasso({ ...base, imagemRedigida });

    expect(fetchMock).toHaveBeenCalledOnce();
    const corpo = corpoEnviado(fetchMock.mock.calls[0]);
    expect(corpo.imagemRedigida).toBe(imagemRedigida);
    expect(corpo.redacaoIncompleta).toBe(false);
  });

  it("imagem grande demais vira passo sem imagem (a ação não se perde)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk());
    vi.stubGlobal("fetch", fetchMock);

    const imagemRedigida = `data:image/jpeg;base64,${"A".repeat(MAX_IMAGEM_BYTES + 1)}`;
    await enviarPasso({ ...base, imagemRedigida });

    expect(fetchMock).toHaveBeenCalledOnce();
    const corpo = corpoEnviado(fetchMock.mock.calls[0]);
    expect(corpo.imagemRedigida).toBeUndefined();
    expect(corpo.redacaoIncompleta).toBe(true);
    expect(corpo.correlacaoId).toBe(base.correlacaoId);
    expect(corpo.titulo).toBe(base.titulo);
  });

  it("413 gera exatamente 1 retentativa sem imagem, sem loop", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(resposta413()).mockResolvedValueOnce(respostaOk());
    vi.stubGlobal("fetch", fetchMock);

    const imagemRedigida = `data:image/jpeg;base64,${"A".repeat(1000)}`;
    await enviarPasso({ ...base, imagemRedigida });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const primeiroCorpo = corpoEnviado(fetchMock.mock.calls[0]);
    const segundoCorpo = corpoEnviado(fetchMock.mock.calls[1]);
    expect(primeiroCorpo.imagemRedigida).toBe(imagemRedigida);
    expect(segundoCorpo.imagemRedigida).toBeUndefined();
    expect(segundoCorpo.redacaoIncompleta).toBe(true);
  });

  it("413 na retentativa sem imagem não gera uma terceira chamada", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resposta413());
    vi.stubGlobal("fetch", fetchMock);

    const imagemRedigida = `data:image/jpeg;base64,${"A".repeat(1000)}`;
    await enviarPasso({ ...base, imagemRedigida });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
