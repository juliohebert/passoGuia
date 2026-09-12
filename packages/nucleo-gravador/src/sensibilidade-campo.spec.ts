import { describe, expect, it } from "vitest";
import {
  classificarSensibilidade,
  confiancaSensivel,
  pareceRotuloEstruturalSensivel,
  pareceSensivel,
} from "./sensibilidade-campo";

describe("pareceSensivel", () => {
  it("password é sempre sensível", () => {
    expect(pareceSensivel({ tipoInput: "password" })).toBe(true);
    // mesmo sem nenhum outro metadado (name/id/aria-label vazios).
    expect(pareceSensivel({ tipoInput: "password", name: "", id: "" })).toBe(true);
  });

  it("campo de busca/filtro genérico não é sensível", () => {
    expect(
      pareceSensivel({
        tipoInput: "search",
        name: "busca",
        id: "campo-busca",
        placeholder: "Buscar paciente...",
      }),
    ).toBe(false);
  });

  it("campo CPF/documento é sensível pelo name/id/label", () => {
    expect(pareceSensivel({ tipoInput: "text", name: "cpf_paciente" })).toBe(true);
    expect(pareceSensivel({ tipoInput: "text", id: "documento-identidade" })).toBe(true);
    expect(pareceSensivel({ tipoInput: "text", textoRotulo: "CNPJ da clínica" })).toBe(true);
  });

  it("campo de token/segredo é sensível", () => {
    expect(pareceSensivel({ tipoInput: "text", name: "api_token" })).toBe(true);
    expect(pareceSensivel({ tipoInput: "text", placeholder: "Segredo de integração" })).toBe(
      true,
    );
  });

  it("caso ambíguo (sem metadado confiável) continua mascarado", () => {
    expect(pareceSensivel({ classificavelComSeguranca: false })).toBe(true);
  });

  it("select comum (sem indício sensível) não é mascarado automaticamente", () => {
    expect(pareceSensivel({ tipoInput: undefined, name: "estado", id: "uf" })).toBe(false);
  });

  it("campo vazio, sem indício sensível, não é mascarado", () => {
    expect(pareceSensivel({})).toBe(false);
  });

  it("elemento marcado explicitamente via type/autocomplete é sensível", () => {
    expect(pareceSensivel({ tipoInput: "email" })).toBe(true);
    expect(pareceSensivel({ tipoInput: "tel" })).toBe(true);
    expect(pareceSensivel({ autocompletar: "cc-number" })).toBe(true);
    expect(pareceSensivel({ autocompletar: "current-password" })).toBe(true);
  });

  it("rótulo/aria-label indicando telefone ou e-mail é sensível", () => {
    expect(pareceSensivel({ rotuloAria: "Telefone de contato" })).toBe(true);
    expect(pareceSensivel({ placeholder: "seu@email.com" })).toBe(true);
  });

  it("campo comum com 'paciente' só no placeholder (ex.: busca) continua não sensível", () => {
    // "paciente" é rótulo estrutural (coluna/<dt>), não palavra de campo — evita que um
    // campo de busca com placeholder "Buscar paciente..." vire sensível à toa.
    expect(pareceSensivel({ tipoInput: "search", placeholder: "Buscar paciente..." })).toBe(
      false,
    );
  });
});

describe("confiancaSensivel — mascaramento automático só para alta confiança", () => {
  it("password/email/tel (type nativo) e autocomplete padronizado são ALTA confiança", () => {
    expect(confiancaSensivel({ tipoInput: "password" })).toBe("alta");
    expect(confiancaSensivel({ tipoInput: "email" })).toBe("alta");
    expect(confiancaSensivel({ tipoInput: "tel" })).toBe("alta");
    expect(confiancaSensivel({ autocompletar: "current-password" })).toBe("alta");
    expect(confiancaSensivel({ autocompletar: "cc-number" })).toBe("alta");
  });

  it("vocabulário PII nuclear (senha, CPF, telefone, e-mail) em name/id/label é ALTA confiança", () => {
    expect(confiancaSensivel({ tipoInput: "text", name: "cpf_paciente" })).toBe("alta");
    expect(confiancaSensivel({ tipoInput: "text", id: "documento-identidade" })).toBe("alta");
    expect(confiancaSensivel({ rotuloAria: "Telefone de contato" })).toBe("alta");
    expect(confiancaSensivel({ placeholder: "seu@email.com" })).toBe("alta");
  });

  it("caso ambíguo (fail-safe, sem metadado confiável) é BAIXA confiança — não mascara sozinho", () => {
    expect(confiancaSensivel({ classificavelComSeguranca: false })).toBe("baixa");
  });

  it("vocabulário mais amplo/ambíguo (cartão, token, conta, pix...) é BAIXA confiança", () => {
    expect(confiancaSensivel({ tipoInput: "text", name: "api_token" })).toBe("baixa");
    expect(confiancaSensivel({ tipoInput: "text", placeholder: "Segredo de integração" })).toBe(
      "baixa",
    );
    expect(confiancaSensivel({ tipoInput: "text", name: "numero_conta" })).toBe("baixa");
  });

  it("campo comum, sem nenhum indício, não é sensível (undefined)", () => {
    expect(confiancaSensivel({})).toBeUndefined();
    expect(confiancaSensivel({ tipoInput: "search", name: "busca" })).toBeUndefined();
  });

  it("pareceSensivel continua true para alta OU baixa confiança (compatibilidade)", () => {
    expect(pareceSensivel({ name: "api_token" })).toBe(true); // baixa, mas ainda "sensível"
    expect(pareceSensivel({ name: "cpf" })).toBe(true); // alta
    expect(pareceSensivel({ name: "busca" })).toBe(false);
  });
});

describe("classificarSensibilidade — motivo é sempre categoria segura, nunca o valor do campo", () => {
  it("motivo nunca contém o name/id/placeholder/rótulo originais (só a categoria)", () => {
    const c = classificarSensibilidade({
      tipoInput: "text",
      name: "cpf_paciente_joao_da_silva",
      placeholder: "Digite o CPF de João da Silva",
    });
    expect(c?.confianca).toBe("alta");
    expect(c?.motivo).not.toContain("joao");
    expect(c?.motivo).not.toContain("João");
    expect(c?.motivo).not.toContain("cpf_paciente_joao_da_silva");
  });

  it("password/email/tel (tipo nativo) → alta, motivo categórico", () => {
    expect(classificarSensibilidade({ tipoInput: "password" })).toEqual({
      confianca: "alta",
      motivo: expect.any(String),
    });
  });

  it("fail-safe (sem metadado confiável) → baixa, motivo categórico", () => {
    const c = classificarSensibilidade({ classificavelComSeguranca: false });
    expect(c?.confianca).toBe("baixa");
    expect(typeof c?.motivo).toBe("string");
  });

  it("campo comum, sem indício → undefined (nenhuma sugestão)", () => {
    expect(classificarSensibilidade({ name: "busca" })).toBeUndefined();
  });
});

describe("pareceRotuloEstruturalSensivel", () => {
  it("cabeçalho/rótulo de coluna 'Paciente', 'Data de Nascimento' ou 'Endereço' é sensível", () => {
    expect(pareceRotuloEstruturalSensivel("Paciente")).toBe(true);
    expect(pareceRotuloEstruturalSensivel("Data de Nascimento")).toBe(true);
    expect(pareceRotuloEstruturalSensivel("Endereço")).toBe(true);
  });

  it("também reconhece as mesmas palavras-chave de campo (CPF, telefone, etc.)", () => {
    expect(pareceRotuloEstruturalSensivel("CPF")).toBe(true);
    expect(pareceRotuloEstruturalSensivel("Telefone")).toBe(true);
  });

  it("rótulo genérico (ex.: coluna de produto) continua não sensível", () => {
    expect(pareceRotuloEstruturalSensivel("Produto")).toBe(false);
    expect(pareceRotuloEstruturalSensivel("Nome do Produto")).toBe(false);
    expect(pareceRotuloEstruturalSensivel("Preço")).toBe(false);
  });
});
