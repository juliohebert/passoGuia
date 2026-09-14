import { describe, expect, it } from "vitest";
import { decidirNavegacao, dominioBase, mesmoSitePermitido, sitePermitidoNaLista } from "./mesmo-site";

describe("dominioBase (Public Suffix List real via pacote `psl` — sem lista manual)", () => {
  it("domínio simples (.com): duas partes", () => {
    expect(dominioBase("app.exemplo.com")).toBe("exemplo.com");
    expect(dominioBase("exemplo.com")).toBe("exemplo.com");
  });

  it("sufixo composto (.com.br): três partes — caso real do QuarkClinic, resolvido pela PSL", () => {
    expect(dominioBase("ng.quarkclinic.com.br")).toBe("quarkclinic.com.br");
    expect(dominioBase("gng.quarkclinic.com.br")).toBe("quarkclinic.com.br");
    expect(dominioBase("quarkclinic.com.br")).toBe("quarkclinic.com.br");
  });

  it("outros sufixos compostos reais (nunca precisam estar numa lista mantida à mão)", () => {
    expect(dominioBase("app.exemplo.co.uk")).toBe("exemplo.co.uk");
    expect(dominioBase("painel.sistema.com.au")).toBe("sistema.com.au");
  });

  it("múltiplos níveis de subdomínio, ainda com sufixo composto", () => {
    expect(dominioBase("a.b.c.quarkclinic.com.br")).toBe("quarkclinic.com.br");
  });

  it("localhost nunca é stripado", () => {
    expect(dominioBase("localhost")).toBe("localhost");
  });

  it("IPv4 nunca é stripado (a PSL cortaria errado)", () => {
    expect(dominioBase("192.168.0.10")).toBe("192.168.0.10");
  });

  it("IPv6 (contém ':') nunca é stripado", () => {
    expect(dominioBase("::1")).toBe("::1");
  });

  it("host vazio devolve undefined", () => {
    expect(dominioBase("")).toBeUndefined();
    expect(dominioBase("   ")).toBeUndefined();
  });

  it("normaliza maiúsculas/minúsculas", () => {
    expect(dominioBase("NG.QuarkClinic.COM.BR")).toBe("quarkclinic.com.br");
  });
});

describe("mesmoSitePermitido — regra: mesmo protocolo + mesmo domínio-base (nunca comparação frágil por string)", () => {
  it("mesmo host: sempre o mesmo site", () => {
    expect(mesmoSitePermitido("https://ng.quarkclinic.com.br/painel", "https://ng.quarkclinic.com.br/outra")).toBe(
      true,
    );
  });

  it("caso real confirmado: subdomínios diferentes do mesmo domínio-base continuam a mesma sessão", () => {
    expect(
      mesmoSitePermitido("https://ng.quarkclinic.com.br/painel", "https://gng.quarkclinic.com.br/painel"),
    ).toBe(true);
    // nos dois sentidos
    expect(
      mesmoSitePermitido("https://gng.quarkclinic.com.br/painel", "https://ng.quarkclinic.com.br/painel"),
    ).toBe(true);
  });

  it("domínio realmente diferente não é o mesmo site", () => {
    expect(mesmoSitePermitido("https://ng.quarkclinic.com.br", "https://outrosistema.com.br")).toBe(false);
    expect(mesmoSitePermitido("https://ng.quarkclinic.com.br", "https://quarkclinic.com")).toBe(false); // TLD diferente
  });

  it("domínio parecido mas não subdomínio real (ataque de prefixo) não é o mesmo site", () => {
    // "quarkclinic.com.br.malicioso.com" tem host terminando em outro domínio-base.
    expect(mesmoSitePermitido("https://ng.quarkclinic.com.br", "https://quarkclinic.com.br.malicioso.com")).toBe(
      false,
    );
  });

  it("http vs https no mesmo host: protocolos diferentes, não é o mesmo site", () => {
    expect(mesmoSitePermitido("http://ng.quarkclinic.com.br", "https://ng.quarkclinic.com.br")).toBe(false);
  });

  it("https nos dois lados, mesmo domínio-base: continua o mesmo site", () => {
    expect(mesmoSitePermitido("https://ng.quarkclinic.com.br", "https://gng.quarkclinic.com.br")).toBe(true);
  });

  it("porta é ignorada na comparação (mesma definição de 'site' do isolamento do Chrome)", () => {
    expect(mesmoSitePermitido("https://ng.quarkclinic.com.br:8443", "https://gng.quarkclinic.com.br")).toBe(true);
  });

  it("localhost em portas diferentes: mesmo site (dev)", () => {
    expect(mesmoSitePermitido("http://localhost:3000", "http://localhost:4000")).toBe(true);
  });

  it("URL inválida em qualquer lado nunca é o mesmo site (conservador)", () => {
    expect(mesmoSitePermitido("não é uma url", "https://ng.quarkclinic.com.br")).toBe(false);
    expect(mesmoSitePermitido("https://ng.quarkclinic.com.br", "não é uma url")).toBe(false);
    expect(mesmoSitePermitido("não é uma url", "também não é")).toBe(false);
  });

  it("URL ausente (undefined) ou vazia em qualquer lado nunca é o mesmo site", () => {
    expect(mesmoSitePermitido(undefined, "https://ng.quarkclinic.com.br")).toBe(false);
    expect(mesmoSitePermitido("https://ng.quarkclinic.com.br", undefined)).toBe(false);
    expect(mesmoSitePermitido("", "https://ng.quarkclinic.com.br")).toBe(false);
  });

  it("nunca lança, mesmo com entradas estranhas", () => {
    expect(() => mesmoSitePermitido("javascript:alert(1)", "https://ng.quarkclinic.com.br")).not.toThrow();
    expect(() => mesmoSitePermitido("about:blank", "https://ng.quarkclinic.com.br")).not.toThrow();
  });
});

describe("sitePermitidoNaLista — uma gravação pode autorizar VÁRIOS sites ao longo do tempo", () => {
  it("lista vazia: nunca permitido", () => {
    expect(sitePermitidoNaLista([], "https://ng.quarkclinic.com.br")).toBe(false);
  });

  it("permitido se bater com QUALQUER site da lista, não só o primeiro", () => {
    const lista = ["https://ng.quarkclinic.com.br", "https://outrosistema.com.br"];
    expect(sitePermitidoNaLista(lista, "https://gng.quarkclinic.com.br")).toBe(true); // subdomínio do 1º
    expect(sitePermitidoNaLista(lista, "https://painel.outrosistema.com.br")).toBe(true); // subdomínio do 2º
    expect(sitePermitidoNaLista(lista, "https://terceiro.com.br")).toBe(false);
  });
});

describe("decidirNavegacao — o que fazer com a sessão ao observar uma navegação (nunca pausa por incerteza)", () => {
  it("ng.quarkclinic.com.br -> gng.quarkclinic.com.br: mantém a stream da aba", () => {
    expect(decidirNavegacao(["https://ng.quarkclinic.com.br"], "https://gng.quarkclinic.com.br")).toEqual({
      tipo: "manter",
    });
  });

  it("mantém a sessão quando muda para outro domínio http/https", () => {
    expect(
      decidirNavegacao(["https://primeiro.com.br", "https://ng.quarkclinic.com.br"], "https://gng.quarkclinic.com.br"),
    ).toEqual({ tipo: "manter" });
  });

  it("URL nova temporariamente desconhecida (undefined): NUNCA pausa", () => {
    expect(decidirNavegacao(["https://ng.quarkclinic.com.br"], undefined)).toEqual({
      tipo: "manter-url-desconhecida",
    });
  });

  it("URL nova vazia: tratada como desconhecida, NUNCA pausa", () => {
    expect(decidirNavegacao(["https://ng.quarkclinic.com.br"], "")).toEqual({
      tipo: "manter-url-desconhecida",
    });
  });

  it("domínio novo, com URL http confirmada: mantém a mesma stream", () => {
    expect(decidirNavegacao(["https://ng.quarkclinic.com.br"], "https://outrosistema.com.br")).toEqual({ tipo: "manter" });
  });

  it("nenhum site autorizado ainda: URL http/https mantém a stream ativa", () => {
    expect(decidirNavegacao([], "https://ng.quarkclinic.com.br")).toEqual({ tipo: "manter" });
  });

  it("só pausa com URL CONFIRMADA — nunca por incerteza (regressão do bug real do QuarkClinic)", () => {
    // Antes da correção, `urlDaAba` retornando `undefined` (comum durante
    // troca de processo/prerender) era tratado como "origem diferente" e
    // encerrava/pausava a captura no meio de uma navegação same-site normal.
    const decisao = decidirNavegacao(["https://ng.quarkclinic.com.br"], undefined);
    expect(decisao.tipo).not.toBe("pausar");
  });
});
