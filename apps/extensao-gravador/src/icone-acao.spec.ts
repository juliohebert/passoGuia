import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** OffscreenCanvas não existe no ambiente de teste (Node) — stub mínimo, só o suficiente para o desenho rodar. */
class OffscreenCanvasFake {
  constructor(
    public width: number,
    public height: number,
  ) {}

  getContext() {
    return {
      clearRect: vi.fn(),
      fillStyle: "",
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      getImageData: (_x: number, _y: number, largura: number, altura: number) => ({
        width: largura,
        height: altura,
        data: new Uint8ClampedArray(largura * altura * 4),
        colorSpace: "srgb" as const,
      }),
    };
  }
}

function mockChromeAction() {
  const setIcon = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", { action: { setIcon } });
  return setIcon;
}

describe("icone-acao — feedback visual do ícone da extensão", () => {
  beforeEach(() => {
    vi.resetModules(); // limpa o cache de ImageData em memória do módulo entre testes
    vi.stubGlobal("OffscreenCanvas", OffscreenCanvasFake);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marcarIconeAtivo chama chrome.action.setIcon com o tabId e imageData para os 4 tamanhos", async () => {
    const setIcon = mockChromeAction();
    const { marcarIconeAtivo } = await import("./icone-acao");

    await marcarIconeAtivo(42);

    expect(setIcon).toHaveBeenCalledTimes(1);
    const [{ tabId, imageData }] = setIcon.mock.calls[0] as [{ tabId: number; imageData: Record<number, unknown> }];
    expect(tabId).toBe(42);
    expect(Object.keys(imageData).map(Number).sort((a, b) => a - b)).toEqual([16, 32, 48, 128]);
  });

  it("marcarIconeInativo chama chrome.action.setIcon com o tabId correto", async () => {
    const setIcon = mockChromeAction();
    const { marcarIconeInativo } = await import("./icone-acao");

    await marcarIconeInativo(7);

    expect(setIcon).toHaveBeenCalledTimes(1);
    const [{ tabId }] = setIcon.mock.calls[0] as [{ tabId: number }];
    expect(tabId).toBe(7);
  });

  it("ativo e inativo usam imageData DIFERENTE (cores distintas, nunca o mesmo desenho)", async () => {
    const setIcon = mockChromeAction();
    const { marcarIconeAtivo, marcarIconeInativo } = await import("./icone-acao");

    await marcarIconeAtivo(1);
    await marcarIconeInativo(1);

    const [chamadaAtiva, chamadaInativa] = setIcon.mock.calls as [
      [{ imageData: unknown }],
      [{ imageData: unknown }],
    ];
    expect(chamadaAtiva[0].imageData).not.toBe(chamadaInativa[0].imageData);
  });

  it("chamadas repetidas para o mesmo estado reaproveitam o desenho já feito (cache)", async () => {
    mockChromeAction();
    const construirSpy = vi.spyOn(globalThis, "OffscreenCanvas");
    const { marcarIconeAtivo } = await import("./icone-acao");

    await marcarIconeAtivo(1);
    await marcarIconeAtivo(2);
    await marcarIconeAtivo(3);

    // 4 tamanhos desenhados uma vez só, não a cada chamada (3 chamadas, 1 desenho).
    expect(construirSpy).toHaveBeenCalledTimes(4);
  });

  it("nunca lança se chrome.action.setIcon rejeitar (ex.: aba já fechada)", async () => {
    vi.stubGlobal("chrome", {
      action: { setIcon: vi.fn().mockRejectedValue(new Error("No tab with id: 999")) },
    });
    const { marcarIconeAtivo, marcarIconeInativo, marcarIconeAguardandoPermissao } = await import("./icone-acao");

    await expect(marcarIconeAtivo(999)).resolves.toBeUndefined();
    await expect(marcarIconeInativo(999)).resolves.toBeUndefined();
    await expect(marcarIconeAguardandoPermissao(999)).resolves.toBeUndefined();
  });

  it("marcarIconeAguardandoPermissao chama chrome.action.setIcon com o tabId correto", async () => {
    const setIcon = mockChromeAction();
    const { marcarIconeAguardandoPermissao } = await import("./icone-acao");

    await marcarIconeAguardandoPermissao(5);

    expect(setIcon).toHaveBeenCalledTimes(1);
    const [{ tabId }] = setIcon.mock.calls[0] as [{ tabId: number }];
    expect(tabId).toBe(5);
  });

  it("os três estados (ativo/inativo/aguardando permissão) usam imageData DIFERENTE entre si", async () => {
    const setIcon = mockChromeAction();
    const { marcarIconeAtivo, marcarIconeInativo, marcarIconeAguardandoPermissao } = await import("./icone-acao");

    await marcarIconeAtivo(1);
    await marcarIconeInativo(1);
    await marcarIconeAguardandoPermissao(1);

    const [ativo, inativo, aguardando] = setIcon.mock.calls as [
      [{ imageData: unknown }],
      [{ imageData: unknown }],
      [{ imageData: unknown }],
    ];
    expect(ativo[0].imageData).not.toBe(inativo[0].imageData);
    expect(ativo[0].imageData).not.toBe(aguardando[0].imageData);
    expect(inativo[0].imageData).not.toBe(aguardando[0].imageData);
  });
});
