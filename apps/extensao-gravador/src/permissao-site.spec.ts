import { afterEach, describe, expect, it, vi } from "vitest";
import { padraoDoSite, solicitarPermissaoParaNavegacoes, solicitarPermissaoSite } from "./permissao-site";

function mockChromePermissions(opcoes: { request?: boolean | Error } = {}) {
  const request =
    opcoes.request instanceof Error
      ? vi.fn().mockRejectedValue(opcoes.request)
      : vi.fn().mockResolvedValue(opcoes.request ?? false);
  vi.stubGlobal("chrome", { permissions: { request } });
  return { request };
}

describe("padraoDoSite", () => {
  it("gera um padrão de host que cobre o domínio-base e TODOS os subdomínios, qualquer protocolo", () => {
    expect(padraoDoSite("quarkclinic.com.br")).toBe("*://*.quarkclinic.com.br/*");
  });
});

describe("solicitarPermissaoSite — permissão de host sob demanda (nunca <all_urls> permanente)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("permissão já concedida: chrome.permissions.request devolve true sem novo prompt", async () => {
    const { request } = mockChromePermissions({ request: true });

    const concedida = await solicitarPermissaoSite("quarkclinic.com.br");

    expect(concedida).toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: ["*://*.quarkclinic.com.br/*"] });
  });

  it("ainda não concedida: pede via chrome.permissions.request e devolve o que o usuário decidiu (concedeu)", async () => {
    const { request } = mockChromePermissions({ request: true });

    const concedida = await solicitarPermissaoSite("quarkclinic.com.br");

    expect(concedida).toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: ["*://*.quarkclinic.com.br/*"] });
  });

  it("permissão negada pelo usuário: devolve false", async () => {
    mockChromePermissions({ request: false });

    expect(await solicitarPermissaoSite("quarkclinic.com.br")).toBe(false);
  });

  it("nunca lança — falha na API de permissões devolve false", async () => {
    vi.stubGlobal("chrome", {
      permissions: {
        request: vi.fn().mockRejectedValue(new Error("falha interna")),
      },
    });

    await expect(solicitarPermissaoSite("quarkclinic.com.br")).resolves.toBe(false);
  });

  it("nunca lança — falha na API de permissões (request) devolve false", async () => {
    mockChromePermissions({ request: new Error("falha interna") });

    await expect(solicitarPermissaoSite("quarkclinic.com.br")).resolves.toBe(false);
  });

  it("pede uma única permissão opcional ampla para reinjetar após navegações", async () => {
    const { request } = mockChromePermissions({ request: true });

    await expect(solicitarPermissaoParaNavegacoes()).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: ["*://*/*"] });
  });
});
