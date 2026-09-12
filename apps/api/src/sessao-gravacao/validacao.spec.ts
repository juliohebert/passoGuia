import { describe, expect, it } from "vitest";
import { validarPassoRecebido } from "./validacao";

const base = {
  correlacaoId: "abc-123",
  tipoAcao: "CLIQUE",
  titulo: "Clique em Salvar",
  descricao: "Clique em Salvar para confirmar.",
  redacaoIncompleta: false,
  ocorridoEm: 1_700_000_000_000,
};

describe("validarPassoRecebido", () => {
  it("aceita um passo mínimo válido", () => {
    const passo = validarPassoRecebido(base);
    expect(passo.correlacaoId).toBe("abc-123");
    expect(passo.tipoAcao).toBe("CLIQUE");
    expect(passo.titulo).toBe("Clique em Salvar");
    expect(passo.imagemRedigida).toBeUndefined();
  });

  it("aceita campos opcionais válidos (seletor, urlOrigem, imagemRedigida)", () => {
    const passo = validarPassoRecebido({
      ...base,
      seletor: "#salvar",
      urlOrigem: "https://exemplo.com/app",
      imagemRedigida: "data:image/jpeg;base64,AAAA",
    });
    expect(passo.seletor).toBe("#salvar");
    expect(passo.urlOrigem).toBe("https://exemplo.com/app");
    expect(passo.imagemRedigida).toBe("data:image/jpeg;base64,AAAA");
  });

  it("descarta campos fora da whitelist (value / texto digitado / evento bruto)", () => {
    const passo = validarPassoRecebido({
      ...base,
      value: "senha123",
      textoDigitado: "abc",
      eventoBruto: { tipo: "keydown", key: "a" },
    });
    expect(passo).not.toHaveProperty("value");
    expect(passo).not.toHaveProperty("textoDigitado");
    expect(passo).not.toHaveProperty("eventoBruto");
    expect(Object.keys(passo).sort()).toEqual(
      ["correlacaoId", "descricao", "ocorridoEm", "redacaoIncompleta", "tipoAcao", "titulo"].sort(),
    );
  });

  it("rejeita payload que não é objeto", () => {
    expect(() => validarPassoRecebido("nope")).toThrow();
    expect(() => validarPassoRecebido(null)).toThrow();
    expect(() => validarPassoRecebido(42)).toThrow();
  });

  it("rejeita tipoAcao desconhecido", () => {
    expect(() => validarPassoRecebido({ ...base, tipoAcao: "DIGITAR" })).toThrow(/tipoAcao/);
  });

  it("rejeita titulo ausente ou vazio", () => {
    const semTitulo: Record<string, unknown> = { ...base };
    delete semTitulo.titulo;
    expect(() => validarPassoRecebido(semTitulo)).toThrow(/titulo/);
    expect(() => validarPassoRecebido({ ...base, titulo: "   " })).toThrow(/titulo/);
  });

  it("rejeita descricao ausente ou vazia", () => {
    const semDescricao: Record<string, unknown> = { ...base };
    delete semDescricao.descricao;
    expect(() => validarPassoRecebido(semDescricao)).toThrow(/descricao/);
    expect(() => validarPassoRecebido({ ...base, descricao: "   " })).toThrow(/descricao/);
  });

  it("rejeita ocorridoEm inválido", () => {
    expect(() => validarPassoRecebido({ ...base, ocorridoEm: -1 })).toThrow(/ocorridoEm/);
    expect(() => validarPassoRecebido({ ...base, ocorridoEm: "agora" })).toThrow(/ocorridoEm/);
  });

  it("rejeita redacaoIncompleta que não é booleano", () => {
    expect(() => validarPassoRecebido({ ...base, redacaoIncompleta: "sim" })).toThrow(
      /redacaoIncompleta/,
    );
  });

  it("rejeita imagemRedigida que não é data URL de imagem", () => {
    expect(() => validarPassoRecebido({ ...base, imagemRedigida: "https://x/y.png" })).toThrow(
      /imagemRedigida/,
    );
  });

  it("aceita um passo válido sem imagem (screenshot indisponível, ação preservada)", () => {
    const passo = validarPassoRecebido(base);
    expect(passo.imagemRedigida).toBeUndefined();
    expect(passo.redacaoIncompleta).toBe(false);
    expect(passo.titulo).toBe("Clique em Salvar");
  });

  it("aceita um passo com redacaoIncompleta=true e sem imagem", () => {
    const passo = validarPassoRecebido({ ...base, redacaoIncompleta: true });
    expect(passo.redacaoIncompleta).toBe(true);
    expect(passo.imagemRedigida).toBeUndefined();
  });

  it("rejeita imagemRedigida junto de redacaoIncompleta=true", () => {
    expect(() =>
      validarPassoRecebido({
        ...base,
        redacaoIncompleta: true,
        imagemRedigida: "data:image/jpeg;base64,AAAA",
      }),
    ).toThrow(/imagemRedigida/);
  });
});
