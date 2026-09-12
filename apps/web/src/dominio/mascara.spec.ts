import { describe, expect, it } from "vitest";
import {
  adicionarMascaraManual,
  ajustarGeometriaMascara,
  alternarAtivaMascara,
  estadoInicialEditor,
  paraPercentual,
  percentualParaRegiao,
  regioesParaRenderizar,
  removerMascara,
  sugestaoParaMascara,
} from "./mascara";
import type { MascaraAplicada, SugestaoMascara } from "./tipos";

function sugestao(overrides: Partial<SugestaoMascara> = {}): SugestaoMascara {
  return { x: 10, y: 20, largura: 100, altura: 30, motivo: "campo com tipo HTML sensível", confianca: "alta", ...overrides };
}

function mascara(overrides: Partial<MascaraAplicada> = {}): MascaraAplicada {
  return { id: "m1", x: 5, y: 5, largura: 50, altura: 50, origem: "manual", ativa: true, ...overrides };
}

describe("regioesParaRenderizar — precedência de máscaras salvas sobre sugestões", () => {
  it("passo só com sugestões → renderiza as sugestões", () => {
    const regioes = regioesParaRenderizar({ sugestoesMascara: [sugestao()] });
    expect(regioes).toEqual([{ x: 10, y: 20, largura: 100, altura: 30 }]);
  });

  it("passo com máscaras salvas → renderiza as máscaras, IGNORA as sugestões (mesmo que existam as duas)", () => {
    const regioes = regioesParaRenderizar({
      sugestoesMascara: [sugestao({ x: 999 })],
      mascarasAplicadas: [mascara()],
    });
    expect(regioes).toEqual([{ x: 5, y: 5, largura: 50, altura: 50 }]);
  });

  it("máscaras inativas (ativa:false) não são renderizadas", () => {
    const regioes = regioesParaRenderizar({
      mascarasAplicadas: [mascara({ ativa: true }), mascara({ id: "m2", ativa: false })],
    });
    expect(regioes).toEqual([{ x: 5, y: 5, largura: 50, altura: 50 }]);
  });

  it("mascarasAplicadas=[] (usuário removeu todas) → nenhuma região, mesmo com sugestões pendentes", () => {
    const regioes = regioesParaRenderizar({
      sugestoesMascara: [sugestao()],
      mascarasAplicadas: [],
    });
    expect(regioes).toEqual([]);
  });

  it("passo sem sugestões e sem máscaras → nenhuma região", () => {
    expect(regioesParaRenderizar({})).toEqual([]);
  });

  it("compatibilidade: passo antigo (sem os dois campos) não quebra", () => {
    expect(regioesParaRenderizar({ sugestoesMascara: undefined, mascarasAplicadas: undefined })).toEqual(
      [],
    );
  });

  it("caso com muitas sugestões: todas as regiões são devolvidas, nenhuma é descartada silenciosamente", () => {
    const muitas = Array.from({ length: 150 }, (_, i) => sugestao({ x: i }));
    const regioes = regioesParaRenderizar({ sugestoesMascara: muitas });
    expect(regioes).toHaveLength(150);
  });
});

describe("estadoInicialEditor", () => {
  it("sem máscaras salvas, parte das sugestões (cada uma vira máscara origem=sugestao, ativa)", () => {
    const estado = estadoInicialEditor({ sugestoesMascara: [sugestao()] });
    expect(estado).toHaveLength(1);
    expect(estado[0]).toMatchObject({ x: 10, y: 20, largura: 100, altura: 30, origem: "sugestao", ativa: true });
    expect(typeof estado[0]?.id).toBe("string");
  });

  it("com máscaras já salvas, edita a partir delas (não das sugestões)", () => {
    const estado = estadoInicialEditor({
      sugestoesMascara: [sugestao({ x: 999 })],
      mascarasAplicadas: [mascara()],
    });
    expect(estado).toEqual([mascara()]);
  });

  it("sem sugestões e sem máscaras, começa vazio", () => {
    expect(estadoInicialEditor({})).toEqual([]);
  });
});

describe("sugestaoParaMascara", () => {
  it("converte geometria preservando valores, sempre origem=sugestao e ativa=true", () => {
    const m = sugestaoParaMascara(sugestao(), "id-fixo");
    expect(m).toEqual({ id: "id-fixo", x: 10, y: 20, largura: 100, altura: 30, origem: "sugestao", ativa: true });
  });
});

describe("transições do editor — criação/remoção/edição de máscara", () => {
  it("adicionarMascaraManual acrescenta uma máscara nova (origem=manual, ativa=true)", () => {
    const resultado = adicionarMascaraManual([mascara({ id: "m1" })], { x: 1, y: 2, largura: 3, altura: 4 }, "m2");
    expect(resultado).toHaveLength(2);
    expect(resultado[1]).toEqual({ id: "m2", x: 1, y: 2, largura: 3, altura: 4, origem: "manual", ativa: true });
  });

  it("removerMascara tira a máscara da lista e preserva as demais", () => {
    const lista = [mascara({ id: "m1" }), mascara({ id: "m2" })];
    expect(removerMascara(lista, "m1")).toEqual([mascara({ id: "m2" })]);
  });

  it("removerMascara com id inexistente não altera a lista", () => {
    const lista = [mascara({ id: "m1" })];
    expect(removerMascara(lista, "nao-existe")).toEqual(lista);
  });

  it("alternarAtivaMascara inverte só a máscara alvo (manter <-> excluir sem apagar o retângulo)", () => {
    const lista = [mascara({ id: "m1", ativa: true }), mascara({ id: "m2", ativa: true })];
    const resultado = alternarAtivaMascara(lista, "m1");
    expect(resultado.find((m) => m.id === "m1")?.ativa).toBe(false);
    expect(resultado.find((m) => m.id === "m2")?.ativa).toBe(true);

    const devolta = alternarAtivaMascara(resultado, "m1");
    expect(devolta.find((m) => m.id === "m1")?.ativa).toBe(true);
  });

  it("ajustarGeometriaMascara move/redimensiona só a máscara alvo, preservando id/origem/ativa", () => {
    const lista = [mascara({ id: "m1", x: 0, y: 0, largura: 10, altura: 10 })];
    const resultado = ajustarGeometriaMascara(lista, "m1", { x: 5, y: 5, largura: 20, altura: 20 });
    expect(resultado).toEqual([
      { id: "m1", x: 5, y: 5, largura: 20, altura: 20, origem: "manual", ativa: true },
    ]);
  });

  it("uma máscara excluída (ativa=false) some da renderização, mas continua editável (não é removerMascara)", () => {
    const lista = alternarAtivaMascara([mascara({ id: "m1" })], "m1");
    expect(regioesParaRenderizar({ mascarasAplicadas: lista })).toEqual([]);
    expect(lista).toHaveLength(1); // ainda existe para o usuário poder reativar
  });
});

describe("paraPercentual / percentualParaRegiao — ida e volta consistente", () => {
  it("converte px de imagem para percentual e de volta, preservando a geometria original", () => {
    const original = { x: 100, y: 50, largura: 200, altura: 40 };
    const pct = paraPercentual(original, 1000, 500);
    expect(pct).toEqual({ left: 10, top: 10, width: 20, height: 8 });

    const volta = percentualParaRegiao(pct, 1000, 500);
    expect(volta).toEqual(original);
  });

  it("dimensões naturais inválidas (0) não quebram — devolve zeros", () => {
    expect(paraPercentual({ x: 1, y: 1, largura: 1, altura: 1 }, 0, 0)).toEqual({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    });
  });

  it("impõe um tamanho mínimo percentual (retângulo nunca vira invisível ao arredondar)", () => {
    const pct = paraPercentual({ x: 0, y: 0, largura: 1, altura: 1 }, 10_000, 10_000);
    expect(pct.width).toBeGreaterThanOrEqual(0.5);
    expect(pct.height).toBeGreaterThanOrEqual(0.5);
  });
});
