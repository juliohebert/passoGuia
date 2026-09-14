import { afterEach, describe, expect, it, vi } from "vitest";
import {
  atualizarImagemPasso,
  atualizarOrigemDaSessao,
  enviarPasso,
  MAX_IMAGEM_BYTES,
  type PassoParaApi,
} from "./envio-api";

const SESSAO_ATIVA_ID = "sessao-real-1";

let sessaoIdMock: string | undefined = SESSAO_ATIVA_ID;

vi.mock("./sessao-id", () => ({
  lerSessaoId: () => Promise.resolve(sessaoIdMock),
}));

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
  sessaoIdMock = SESSAO_ATIVA_ID;
});

describe("enviarPasso", () => {
  it("posta o passo no sessaoId entregue pela web (sessao-id.ts) — nunca num id fixo/hardcoded", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk());
    vi.stubGlobal("fetch", fetchMock);

    await enviarPasso(base);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`http://localhost:3333/sessoes/${SESSAO_ATIVA_ID}/passos`);
  });

  it("nenhum sessaoId recebido ainda: descarta o passo sem postar e sem criar sessão alguma", async () => {
    sessaoIdMock = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await enviarPasso(base);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia a imagem quando ela está dentro do limite", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk());
    vi.stubGlobal("fetch", fetchMock);

    const imagemRedigida = `data:image/jpeg;base64,${"A".repeat(1000)}`;
    await enviarPasso({ ...base, imagemRedigida });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const corpo = corpoEnviado(fetchMock.mock.calls[0]);
    expect(corpo.imagemRedigida).toBe(imagemRedigida);
    expect(corpo.redacaoIncompleta).toBe(false);
  });

  it("imagem grande demais vira passo sem imagem (a ação não se perde)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk());
    vi.stubGlobal("fetch", fetchMock);

    const imagemRedigida = `data:image/jpeg;base64,${"A".repeat(MAX_IMAGEM_BYTES + 1)}`;
    await enviarPasso({ ...base, imagemRedigida });

    expect(fetchMock).toHaveBeenCalledTimes(1);
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

describe("atualizarOrigemDaSessao — identificação automática do sistema alvo", () => {
  it("faz PATCH /sessoes/:sessaoId com a origem real da aba, no sessaoId entregue pela web", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await atualizarOrigemDaSessao("https://ng.quarkclinic.com.br");

    const chamadas = vi.mocked(fetchMock).mock.calls as [string, RequestInit | undefined][];
    expect(chamadas).toHaveLength(1);
    const [url, opcoes] = chamadas[0] ?? [];
    expect(url).toBe(`http://localhost:3333/sessoes/${SESSAO_ATIVA_ID}`);
    expect(opcoes?.method).toBe("PATCH");
    expect(JSON.parse(opcoes?.body as string)).toEqual({ url: "https://ng.quarkclinic.com.br" });
  });

  it("sem sessaoId recebido ainda: não faz PATCH nenhum (nunca cria/força sessão)", async () => {
    sessaoIdMock = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await atualizarOrigemDaSessao("https://ng.quarkclinic.com.br");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("nunca lança — falha de rede no PATCH é silenciosa (captura já está ativa de qualquer forma)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(atualizarOrigemDaSessao("https://ng.quarkclinic.com.br")).resolves.toBeUndefined();
  });
});

describe("atualizarImagemPasso — POST da navegação", () => {
  it("faz PATCH no correlacaoId do passo existente, sem criar outro passo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk());
    vi.stubGlobal("fetch", fetchMock);
    const imagemRedigida = "data:image/jpeg;base64,POST";

    await atualizarImagemPasso(base.correlacaoId, {
      imagemRedigida,
      redacaoIncompleta: false,
      revisaoPrivacidadeNecessaria: false,
      ocorridoEm: base.ocorridoEm,
    });

    const [url, opcoes] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `http://localhost:3333/sessoes/${SESSAO_ATIVA_ID}/passos/${base.correlacaoId}/imagem`,
    );
    expect(opcoes.method).toBe("PATCH");
    expect(JSON.parse(opcoes.body as string).imagemRedigida).toBe(imagemRedigida);
  });
});
