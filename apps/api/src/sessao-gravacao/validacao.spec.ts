import { describe, expect, it } from "vitest";
import { validarAnotacoesImagem, validarMascarasAplicadas, validarPassoRecebido } from "./validacao";

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
      [
        "correlacaoId",
        "descricao",
        "ocorridoEm",
        "redacaoIncompleta",
        "revisaoPrivacidadeNecessaria",
        "tipoAcao",
        "titulo",
      ].sort(),
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

  it("revisaoPrivacidadeNecessaria é opcional na entrada e default é false", () => {
    const passo = validarPassoRecebido(base);
    expect(passo.revisaoPrivacidadeNecessaria).toBe(false);
  });

  it("aceita imagemRedigida junto de revisaoPrivacidadeNecessaria=true (nova política: privacidade não descarta a imagem)", () => {
    const passo = validarPassoRecebido({
      ...base,
      imagemRedigida: "data:image/jpeg;base64,AAAA",
      revisaoPrivacidadeNecessaria: true,
    });
    expect(passo.imagemRedigida).toBe("data:image/jpeg;base64,AAAA");
    expect(passo.revisaoPrivacidadeNecessaria).toBe(true);
    expect(passo.redacaoIncompleta).toBe(false);
  });

  it("rejeita revisaoPrivacidadeNecessaria que não é booleano", () => {
    expect(() =>
      validarPassoRecebido({ ...base, revisaoPrivacidadeNecessaria: "talvez" }),
    ).toThrow(/revisaoPrivacidadeNecessaria/);
  });

  describe("sugestoesMascara", () => {
    const sugestaoValida = { x: 10, y: 20, largura: 100, altura: 30, motivo: "campo com tipo HTML sensível", confianca: "alta" };

    it("é opcional — ausente na entrada, ausente na saída", () => {
      const passo = validarPassoRecebido(base);
      expect(passo.sugestoesMascara).toBeUndefined();
    });

    it("aceita uma lista de sugestões válidas (alta e baixa confiança)", () => {
      const passo = validarPassoRecebido({
        ...base,
        sugestoesMascara: [sugestaoValida, { ...sugestaoValida, confianca: "baixa" }],
      });
      expect(passo.sugestoesMascara).toHaveLength(2);
      expect(passo.sugestoesMascara?.map((s) => s.confianca).sort()).toEqual(["alta", "baixa"]);
    });

    it("rejeita quando não é uma lista", () => {
      expect(() =>
        validarPassoRecebido({ ...base, sugestoesMascara: sugestaoValida }),
      ).toThrow(/sugestoesMascara/);
    });

    it("rejeita item sem geometria numérica válida", () => {
      expect(() =>
        validarPassoRecebido({ ...base, sugestoesMascara: [{ ...sugestaoValida, x: "dez" }] }),
      ).toThrow(/x/);
    });

    it("rejeita largura/altura não positivas", () => {
      expect(() =>
        validarPassoRecebido({ ...base, sugestoesMascara: [{ ...sugestaoValida, largura: 0 }] }),
      ).toThrow(/largura/);
    });

    it("rejeita confianca fora de alta/baixa", () => {
      expect(() =>
        validarPassoRecebido({ ...base, sugestoesMascara: [{ ...sugestaoValida, confianca: "media" }] }),
      ).toThrow(/confianca/);
    });

    it("rejeita motivo ausente (categoria segura é obrigatória)", () => {
      const semMotivo: Record<string, unknown> = { ...sugestaoValida };
      delete semMotivo.motivo;
      expect(() =>
        validarPassoRecebido({ ...base, sugestoesMascara: [semMotivo] }),
      ).toThrow(/motivo/);
    });

    it("nunca aceita um campo extra tipo 'valor'/'texto' dentro da sugestão (whitelist estrita)", () => {
      const passo = validarPassoRecebido({
        ...base,
        sugestoesMascara: [{ ...sugestaoValida, valor: "123.456.789-00", texto: "João da Silva" }],
      });
      const chaves = Object.keys(passo.sugestoesMascara?.[0] ?? {});
      expect(chaves).not.toContain("valor");
      expect(chaves).not.toContain("texto");
      expect(chaves.sort()).toEqual(["altura", "confianca", "largura", "motivo", "x", "y"].sort());
    });

    it("rejeita lista maior que o máximo permitido", () => {
      const muitas = Array.from({ length: 201 }, () => sugestaoValida);
      expect(() => validarPassoRecebido({ ...base, sugestoesMascara: muitas })).toThrow(
        /sugestoesMascara/,
      );
    });
  });
});

describe("validarMascarasAplicadas — editor manual de privacidade (PATCH .../mascaras)", () => {
  const mascaraValida = { id: "m1", x: 10, y: 20, largura: 100, altura: 30, origem: "manual", ativa: true };

  it("aceita uma lista de máscaras válidas (origem sugestao e manual)", () => {
    const mascaras = validarMascarasAplicadas([
      mascaraValida,
      { ...mascaraValida, id: "m2", origem: "sugestao", ativa: false },
    ]);
    expect(mascaras).toHaveLength(2);
    expect(mascaras.map((m) => m.origem).sort()).toEqual(["manual", "sugestao"]);
    expect(mascaras[1]?.ativa).toBe(false);
  });

  it("aceita lista vazia (usuário removeu todas as máscaras)", () => {
    expect(validarMascarasAplicadas([])).toEqual([]);
  });

  it("gera um id quando o cliente não envia um", () => {
    const semId: Record<string, unknown> = { ...mascaraValida };
    delete semId.id;
    const [mascara] = validarMascarasAplicadas([semId]);
    expect(typeof mascara?.id).toBe("string");
    expect(mascara?.id.length).toBeGreaterThan(0);
  });

  it("rejeita quando não é uma lista", () => {
    expect(() => validarMascarasAplicadas(mascaraValida)).toThrow(/mascarasAplicadas/);
    expect(() => validarMascarasAplicadas(null)).toThrow(/mascarasAplicadas/);
  });

  it("rejeita geometria não numérica", () => {
    expect(() => validarMascarasAplicadas([{ ...mascaraValida, x: "dez" }])).toThrow(/x/);
  });

  it("rejeita largura/altura não positivas", () => {
    expect(() => validarMascarasAplicadas([{ ...mascaraValida, largura: 0 }])).toThrow(/largura/);
    expect(() => validarMascarasAplicadas([{ ...mascaraValida, altura: -5 }])).toThrow(/altura/);
  });

  it("rejeita origem fora de sugestao/manual", () => {
    expect(() => validarMascarasAplicadas([{ ...mascaraValida, origem: "ia" }])).toThrow(/origem/);
  });

  it("rejeita ativa que não é booleano", () => {
    expect(() => validarMascarasAplicadas([{ ...mascaraValida, ativa: "sim" }])).toThrow(/ativa/);
  });

  it("nunca aceita motivo/texto livre — whitelist estrita (campos extras somem)", () => {
    const [mascara] = validarMascarasAplicadas([
      { ...mascaraValida, motivo: "CPF do paciente", texto: "123.456.789-00" },
    ]);
    expect(Object.keys(mascara ?? {}).sort()).toEqual(
      ["altura", "ativa", "id", "largura", "origem", "x", "y"].sort(),
    );
  });

  it("rejeita lista maior que o máximo permitido", () => {
    const muitas = Array.from({ length: 101 }, (_, i) => ({ ...mascaraValida, id: `m${String(i)}` }));
    expect(() => validarMascarasAplicadas(muitas)).toThrow(/mascarasAplicadas/);
  });
});

describe("validarAnotacoesImagem — editor de imagem (PATCH .../anotacoes)", () => {
  const mascara = {
    id: "a1",
    tipo: "mascara",
    geometria: { tipo: "retangulo", x: 10, y: 20, largura: 100, altura: 30 },
  };
  const destaque = {
    id: "a2",
    tipo: "destaque",
    geometria: { tipo: "retangulo", x: 0, y: 0, largura: 50, altura: 50 },
  };
  const seta = {
    id: "a3",
    tipo: "seta",
    geometria: { tipo: "seta", x1: 0, y1: 0, x2: 100, y2: 50 },
  };
  const numero = {
    id: "a4",
    tipo: "numero",
    geometria: { tipo: "ponto", x: 5, y: 5 },
    ordem: 1,
  };

  it("aceita uma lista com os 4 tipos válidos", () => {
    const anotacoes = validarAnotacoesImagem([mascara, destaque, seta, numero]);
    expect(anotacoes).toHaveLength(4);
    expect(anotacoes.map((a) => a.tipo)).toEqual(["mascara", "destaque", "seta", "numero"]);
  });

  it("aceita lista vazia", () => {
    expect(validarAnotacoesImagem([])).toEqual([]);
  });

  it("gera id quando ausente", () => {
    const semId: Record<string, unknown> = { ...mascara };
    delete semId.id;
    const [anotacao] = validarAnotacoesImagem([semId]);
    expect(typeof anotacao?.id).toBe("string");
    expect(anotacao?.id.length).toBeGreaterThan(0);
  });

  it("rejeita quando não é lista", () => {
    expect(() => validarAnotacoesImagem(mascara)).toThrow(/anotacoesImagem/);
  });

  it("rejeita tipo desconhecido", () => {
    expect(() =>
      validarAnotacoesImagem([{ ...mascara, tipo: "circulo" }]),
    ).toThrow(/anotacaoImagem\.tipo/);
  });

  it("rejeita geometria do formato errado para o tipo (ex.: seta com geometria de ponto)", () => {
    expect(() =>
      validarAnotacoesImagem([{ ...seta, geometria: { tipo: "ponto", x: 1, y: 1 } }]),
    ).toThrow(/geometria\.tipo/);
  });

  it("rejeita retângulo (mascara/destaque) com largura/altura não positivas", () => {
    expect(() =>
      validarAnotacoesImagem([
        { ...mascara, geometria: { tipo: "retangulo", x: 0, y: 0, largura: 0, altura: 10 } },
      ]),
    ).toThrow(/largura/);
  });

  it("rejeita seta com coordenada não numérica", () => {
    expect(() =>
      validarAnotacoesImagem([{ ...seta, geometria: { ...seta.geometria, x2: "dez" } }]),
    ).toThrow(/x2/);
  });

  it("numero exige ordem inteiro positivo", () => {
    expect(() => validarAnotacoesImagem([{ ...numero, ordem: 0 }])).toThrow(/ordem/);
    expect(() => validarAnotacoesImagem([{ ...numero, ordem: 1.5 }])).toThrow(/ordem/);
    const semOrdem: Record<string, unknown> = { ...numero };
    delete semOrdem.ordem;
    expect(() => validarAnotacoesImagem([semOrdem])).toThrow(/ordem/);
  });

  it("mascara/destaque/seta não exigem (nem aceitam de forma exposta) ordem", () => {
    const [anotacao] = validarAnotacoesImagem([{ ...mascara, ordem: 99 }]);
    expect(anotacao?.ordem).toBeUndefined();
  });

  it("nunca aceita motivo/texto livre — whitelist estrita", () => {
    const [anotacao] = validarAnotacoesImagem([
      { ...mascara, motivo: "CPF do paciente", texto: "123.456.789-00" },
    ]);
    expect(Object.keys(anotacao ?? {}).sort()).toEqual(["geometria", "id", "tipo"].sort());
  });

  it("rejeita lista maior que o máximo permitido", () => {
    const muitas = Array.from({ length: 151 }, (_, i) => ({ ...mascara, id: `a${String(i)}` }));
    expect(() => validarAnotacoesImagem(muitas)).toThrow(/anotacoesImagem/);
  });
});
