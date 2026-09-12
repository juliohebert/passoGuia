import { describe, expect, it } from "vitest";
import { comPadding, limitarAoCanvas, sugestoesParaImagem } from "./redacao-visual";
import type { SugestaoRegiao } from "./protocolo";

function sugestao(
  retangulo: SugestaoRegiao["retangulo"],
  confianca: SugestaoRegiao["confianca"] = "alta",
  motivo = "motivo de teste",
): SugestaoRegiao {
  return { retangulo, confianca, motivo };
}

describe("comPadding", () => {
  it("expande o retângulo igualmente em todas as direções", () => {
    expect(comPadding({ x: 10, y: 10, largura: 100, altura: 20 }, 4)).toEqual({
      x: 6,
      y: 6,
      largura: 108,
      altura: 28,
    });
  });
});

describe("limitarAoCanvas", () => {
  it("não altera um retângulo já dentro dos limites", () => {
    expect(limitarAoCanvas({ x: 10, y: 10, largura: 50, altura: 20 }, 800, 600)).toEqual({
      x: 10,
      y: 10,
      largura: 50,
      altura: 20,
    });
  });

  it("recorta um retângulo que ultrapassa a borda inferior/direita", () => {
    const r = limitarAoCanvas({ x: 780, y: 590, largura: 50, altura: 30 }, 800, 600);
    expect(r).toEqual({ x: 780, y: 590, largura: 20, altura: 10 });
  });

  it("recorta a LARGURA/ALTURA (não só x/y) quando o retângulo começa antes da borda superior/esquerda — regressão do bug de blur deslocado", () => {
    // x=-5 => só 45 dos 50px originais estão dentro do canvas (largura correta: 45, não 50).
    const r = limitarAoCanvas({ x: -5, y: 590, largura: 50, altura: 30 }, 800, 600);
    expect(r).toEqual({ x: 0, y: 590, largura: 45, altura: 10 });
  });

  it("retângulo inteiramente fora do canvas vira largura/altura zero (filtrado depois por sugestoesParaImagem)", () => {
    const r = limitarAoCanvas({ x: -100, y: -100, largura: 50, altura: 30 }, 800, 600);
    expect(r.largura).toBe(0);
    expect(r.altura).toBe(0);
  });
});

describe("sugestoesParaImagem — geometria pura, nunca desenha nada", () => {
  it("sugestão vira retângulo de imagem com padding e escala aplicados, preservando motivo/confiança", () => {
    const sugestoes = [sugestao({ x: 100, y: 100, largura: 200, altura: 30 }, "alta", "campo com tipo HTML sensível")];
    const resultado = sugestoesParaImagem(sugestoes, 2, 2, 1600, 1200);
    // padding 4 -> (96,96,208,38); escala 2 -> (192,192,416,76)
    expect(resultado).toEqual([
      { x: 192, y: 192, largura: 416, altura: 76, confianca: "alta", motivo: "campo com tipo HTML sensível" },
    ]);
  });

  it("sem sugestões, nenhuma sugestão de imagem é produzida", () => {
    expect(sugestoesParaImagem([], 1, 1, 800, 600)).toEqual([]);
  });

  it("baixa confiança também vira sugestão — geometria idêntica, só a confiança muda", () => {
    const sugestoes = [sugestao({ x: 0, y: 0, largura: 50, altura: 20 }, "baixa", "vocabulário amplo/ambíguo")];
    const resultado = sugestoesParaImagem(sugestoes, 1, 1, 800, 600);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.confianca).toBe("baixa");
  });

  it("só as sugestões informadas são transformadas — nada além delas aparece no resultado", () => {
    const sugestoes = [sugestao({ x: 0, y: 0, largura: 50, altura: 20 })];
    const resultado = sugestoesParaImagem(sugestoes, 1, 1, 800, 600);
    expect(resultado).toHaveLength(1);
    expect(resultado.some((r) => r.x >= 500)).toBe(false);
  });

  it("sugestão totalmente fora do viewport/canvas é descartada (nenhuma sugestão fantasma)", () => {
    const sugestoes = [
      sugestao({ x: -500, y: -500, largura: 50, altura: 20 }), // bem antes do canto superior esquerdo
      sugestao({ x: 5000, y: 5000, largura: 50, altura: 20 }), // bem depois do canto inferior direito
      sugestao({ x: 100, y: 100, largura: 50, altura: 20 }), // esta sim está visível
    ];
    const resultado = sugestoesParaImagem(sugestoes, 1, 1, 800, 600);
    expect(resultado).toHaveLength(1);
  });

  it("nenhum campo devolvido contém value/texto do campo — só geometria + categoria/confiança", () => {
    const sugestoes = [sugestao({ x: 0, y: 0, largura: 50, altura: 20 }, "alta", "campo com tipo HTML sensível")];
    const resultado = sugestoesParaImagem(sugestoes, 1, 1, 800, 600);
    expect(Object.keys(resultado[0] ?? {}).sort()).toEqual(
      ["altura", "confianca", "largura", "motivo", "x", "y"].sort(),
    );
  });
});
