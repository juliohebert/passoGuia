import { describe, expect, it } from "vitest";
import {
  adicionarAnotacao,
  anotacoesParaRenderizar,
  atualizarGeometriaAnotacao,
  estadoInicialEditor,
  percentualParaPonto,
  percentualParaRetangulo,
  percentualParaSeta,
  pontoParaPercentual,
  proximoNumero,
  removerAnotacao,
  renumerarMarcadores,
  pontosPontaSeta,
  retanguloParaPercentual,
  setaParaPercentual,
} from "./anotacao";
import type { AnotacaoImagem, MascaraAplicada, SugestaoMascara } from "./tipos";

function mascaraAnotacao(overrides: Partial<AnotacaoImagem> = {}): AnotacaoImagem {
  return {
    id: "a1",
    tipo: "mascara",
    geometria: { tipo: "retangulo", x: 10, y: 10, largura: 50, altura: 20 },
    ...overrides,
  };
}

function numeroAnotacao(id: string, ordem: number, x = 0, y = 0): AnotacaoImagem {
  return { id, tipo: "numero", geometria: { tipo: "ponto", x, y }, ordem };
}

function sugestao(overrides: Partial<SugestaoMascara> = {}): SugestaoMascara {
  return { x: 1, y: 2, largura: 3, altura: 4, motivo: "campo sensível", confianca: "alta", ...overrides };
}

function mascaraLegado(overrides: Partial<MascaraAplicada> = {}): MascaraAplicada {
  return { id: "m1", x: 5, y: 5, largura: 5, altura: 5, origem: "manual", ativa: true, ...overrides };
}

describe("anotacoesParaRenderizar — precedência anotacoesImagem > mascarasAplicadas (legado) > sugestoesMascara", () => {
  it("com anotacoesImagem definido, usa exatamente essa lista (mesmo com os outros dois presentes)", () => {
    const anotacoes = [mascaraAnotacao()];
    const resultado = anotacoesParaRenderizar({
      anotacoesImagem: anotacoes,
      mascarasAplicadas: [mascaraLegado()],
      sugestoesMascara: [sugestao()],
    });
    expect(resultado).toBe(anotacoes);
  });

  it("anotacoesImagem=[] (usuário removeu tudo) → nada renderizado, mesmo com sugestões pendentes", () => {
    expect(
      anotacoesParaRenderizar({ anotacoesImagem: [], sugestoesMascara: [sugestao()] }),
    ).toEqual([]);
  });

  it("sem anotacoesImagem, cai no legado mascarasAplicadas (só as ativas), convertido para tipo=mascara", () => {
    const resultado = anotacoesParaRenderizar({
      mascarasAplicadas: [mascaraLegado({ id: "m1", ativa: true }), mascaraLegado({ id: "m2", ativa: false })],
    });
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({ id: "m1", tipo: "mascara" });
  });

  it("sem anotacoesImagem e sem legado, converte sugestoesMascara em anotações tipo=mascara", () => {
    const resultado = anotacoesParaRenderizar({ sugestoesMascara: [sugestao({ x: 9, y: 9 })] });
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.tipo).toBe("mascara");
    expect(resultado[0]?.geometria).toEqual({ tipo: "retangulo", x: 9, y: 9, largura: 3, altura: 4 });
  });

  it("compatibilidade: passo antigo sem nenhum dos três campos não quebra — lista vazia", () => {
    expect(anotacoesParaRenderizar({})).toEqual([]);
  });
});

describe("estadoInicialEditor", () => {
  it("permite criar máscara mesmo sem NENHUMA sugestão prévia (estado inicial vazio, editável)", () => {
    expect(estadoInicialEditor({})).toEqual([]);
  });

  it("devolve uma CÓPIA (mutar o resultado não afeta o passo original)", () => {
    const original = [mascaraAnotacao()];
    const estado = estadoInicialEditor({ anotacoesImagem: original });
    estado[0]!.geometria = { tipo: "retangulo", x: 999, y: 999, largura: 1, altura: 1 };
    expect(original[0]?.geometria).toEqual({ tipo: "retangulo", x: 10, y: 10, largura: 50, altura: 20 });
  });
});

describe("adicionarAnotacao / criação sem sugestão prévia", () => {
  it("cria uma máscara (retângulo) mesmo com a lista inicialmente vazia", () => {
    const resultado = adicionarAnotacao([], "mascara", { tipo: "retangulo", x: 1, y: 1, largura: 10, altura: 10 }, "id1");
    expect(resultado).toEqual([
      { id: "id1", tipo: "mascara", geometria: { tipo: "retangulo", x: 1, y: 1, largura: 10, altura: 10 } },
    ]);
  });

  it("cria um destaque (mesma geometria de retângulo, tipo diferente)", () => {
    const [anotacao] = adicionarAnotacao([], "destaque", { tipo: "retangulo", x: 0, y: 0, largura: 5, altura: 5 }, "id2");
    expect(anotacao?.tipo).toBe("destaque");
  });

  it("cria uma seta com geometria de dois pontos", () => {
    const [anotacao] = adicionarAnotacao(
      [],
      "seta",
      { tipo: "seta", x1: 0, y1: 0, x2: 50, y2: 30 },
      "id3",
    );
    expect(anotacao?.geometria).toEqual({ tipo: "seta", x1: 0, y1: 0, x2: 50, y2: 30 });
  });

  it("cria um número com ordem=1 na lista vazia", () => {
    const [anotacao] = adicionarAnotacao([], "numero", { tipo: "ponto", x: 5, y: 5 }, "id4");
    expect(anotacao?.ordem).toBe(1);
  });

  it("números seguintes recebem 2, 3... automaticamente", () => {
    let anotacoes = adicionarAnotacao([], "numero", { tipo: "ponto", x: 0, y: 0 }, "n1");
    anotacoes = adicionarAnotacao(anotacoes, "numero", { tipo: "ponto", x: 1, y: 1 }, "n2");
    anotacoes = adicionarAnotacao(anotacoes, "numero", { tipo: "ponto", x: 2, y: 2 }, "n3");
    expect(anotacoes.map((a) => a.ordem)).toEqual([1, 2, 3]);
  });

  it("máscara/destaque/seta nunca recebem `ordem`", () => {
    const [mascara] = adicionarAnotacao([], "mascara", { tipo: "retangulo", x: 0, y: 0, largura: 1, altura: 1 });
    const [seta] = adicionarAnotacao([], "seta", { tipo: "seta", x1: 0, y1: 0, x2: 1, y2: 1 });
    expect(mascara?.ordem).toBeUndefined();
    expect(seta?.ordem).toBeUndefined();
  });
});

describe("proximoNumero", () => {
  it("1 numa lista vazia ou sem nenhum marcador numero", () => {
    expect(proximoNumero([])).toBe(1);
    expect(proximoNumero([mascaraAnotacao()])).toBe(1);
  });

  it("máximo ordem + 1 quando já existem marcadores", () => {
    expect(proximoNumero([numeroAnotacao("n1", 1), numeroAnotacao("n2", 3)])).toBe(4);
  });
});

describe("removerAnotacao — recalcula a sequência dos números restantes", () => {
  it("remove uma anotação qualquer sem afetar as demais", () => {
    const lista = [mascaraAnotacao({ id: "a1" }), mascaraAnotacao({ id: "a2" })];
    expect(removerAnotacao(lista, "a1")).toEqual([mascaraAnotacao({ id: "a2" })]);
  });

  it("remover o número do MEIO renumera 1,2,3 -> 1,2 nos restantes, preservando a ordem relativa", () => {
    const lista = [numeroAnotacao("n1", 1, 0, 0), numeroAnotacao("n2", 2, 10, 10), numeroAnotacao("n3", 3, 20, 20)];
    const resultado = removerAnotacao(lista, "n2");
    expect(resultado).toEqual([numeroAnotacao("n1", 1, 0, 0), numeroAnotacao("n3", 2, 20, 20)]);
  });

  it("remover um número não afeta a numeração de máscaras/destaques/setas presentes", () => {
    const lista = [numeroAnotacao("n1", 1), mascaraAnotacao({ id: "m1" }), numeroAnotacao("n2", 2)];
    const resultado = removerAnotacao(lista, "n1");
    expect(resultado).toEqual([mascaraAnotacao({ id: "m1" }), numeroAnotacao("n2", 1)]);
  });

  it("remover id inexistente não altera a lista (além de renumerar, que é idempotente)", () => {
    const lista = [numeroAnotacao("n1", 1)];
    expect(removerAnotacao(lista, "nao-existe")).toEqual(lista);
  });
});

describe("renumerarMarcadores", () => {
  it("reatribui 1..N só aos tipo=numero, na ordem em que aparecem", () => {
    const lista = [numeroAnotacao("n1", 5), numeroAnotacao("n2", 9)];
    expect(renumerarMarcadores(lista).map((a) => a.ordem)).toEqual([1, 2]);
  });
});

describe("atualizarGeometriaAnotacao — mover/redimensionar", () => {
  it("atualiza só a geometria da anotação alvo, preservando id/tipo/ordem", () => {
    const lista = [numeroAnotacao("n1", 1, 0, 0)];
    const resultado = atualizarGeometriaAnotacao(lista, "n1", { tipo: "ponto", x: 50, y: 60 });
    expect(resultado).toEqual([{ id: "n1", tipo: "numero", ordem: 1, geometria: { tipo: "ponto", x: 50, y: 60 } }]);
  });

  it("redimensiona um retângulo (mascara/destaque) mudando largura/altura", () => {
    const lista = [mascaraAnotacao()];
    const resultado = atualizarGeometriaAnotacao(lista, "a1", {
      tipo: "retangulo",
      x: 10,
      y: 10,
      largura: 200,
      altura: 100,
    });
    expect(resultado[0]?.geometria).toEqual({ tipo: "retangulo", x: 10, y: 10, largura: 200, altura: 100 });
  });

  it("move uma seta (translada os dois pontos)", () => {
    const lista = adicionarAnotacao([], "seta", { tipo: "seta", x1: 0, y1: 0, x2: 10, y2: 10 }, "s1");
    const resultado = atualizarGeometriaAnotacao(lista, "s1", { tipo: "seta", x1: 5, y1: 5, x2: 15, y2: 15 });
    expect(resultado[0]?.geometria).toEqual({ tipo: "seta", x1: 5, y1: 5, x2: 15, y2: 15 });
  });
});

describe("conversão px <-> percentual — ida e volta consistente para os 3 formatos de geometria", () => {
  it("retângulo", () => {
    const original: import("./tipos").GeometriaRetangulo = { tipo: "retangulo", x: 100, y: 50, largura: 200, altura: 40 };
    const pct = retanguloParaPercentual(original, 1000, 500);
    expect(pct).toEqual({ left: 10, top: 10, width: 20, height: 8 });
    expect(percentualParaRetangulo(pct, 1000, 500)).toEqual(original);
  });

  it("ponto", () => {
    const original: import("./tipos").GeometriaPonto = { tipo: "ponto", x: 250, y: 125 };
    const pct = pontoParaPercentual(original, 1000, 500);
    expect(pct).toEqual({ left: 25, top: 25 });
    expect(percentualParaPonto(pct, 1000, 500)).toEqual(original);
  });

  it("seta", () => {
    const original: import("./tipos").GeometriaSeta = { tipo: "seta", x1: 0, y1: 0, x2: 500, y2: 250 };
    const pct = setaParaPercentual(original, 1000, 500);
    expect(pct).toEqual({ x1: 0, y1: 0, x2: 50, y2: 50 });
    expect(percentualParaSeta(pct, 1000, 500)).toEqual(original);
  });

  it("dimensões naturais inválidas (0) não quebram — devolve zeros", () => {
    expect(retanguloParaPercentual({ tipo: "retangulo", x: 1, y: 1, largura: 1, altura: 1 }, 0, 0)).toEqual({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    });
    expect(pontoParaPercentual({ tipo: "ponto", x: 1, y: 1 }, 0, 0)).toEqual({ left: 0, top: 0 });
    expect(setaParaPercentual({ tipo: "seta", x1: 1, y1: 1, x2: 2, y2: 2 }, 0, 0)).toEqual({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
    });
  });
});

describe("pontosPontaSeta — ponta clássica (2 segmentos diagonais), sempre colada ao fim da linha", () => {
  const COMPRIMENTO_LADO = 16;
  const ANGULO_GRAUS = 26;

  function angulo(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  }

  function normalizarGraus(g: number): number {
    let r = g % 360;
    if (r > 180) r -= 360;
    if (r < -180) r += 360;
    return r;
  }

  it("a ponta (1º ponto) é sempre exatamente (x2, y2) — horizontal", () => {
    const [ponta] = pontosPontaSeta({ tipo: "seta", x1: 10, y1: 50, x2: 90, y2: 50 }, COMPRIMENTO_LADO, ANGULO_GRAUS);
    expect(ponta).toEqual({ x: 90, y: 50 });
  });

  it("a ponta (1º ponto) é sempre exatamente (x2, y2) — vertical", () => {
    const [ponta] = pontosPontaSeta({ tipo: "seta", x1: 50, y1: 10, x2: 50, y2: 90 }, COMPRIMENTO_LADO, ANGULO_GRAUS);
    expect(ponta).toEqual({ x: 50, y: 90 });
  });

  it("a ponta (1º ponto) é sempre exatamente (x2, y2) — diagonal", () => {
    const [ponta] = pontosPontaSeta({ tipo: "seta", x1: 0, y1: 0, x2: 100, y2: 100 }, COMPRIMENTO_LADO, ANGULO_GRAUS);
    expect(ponta).toEqual({ x: 100, y: 100 });
  });

  it("a ponta (1º ponto) é sempre exatamente (x2, y2) — seta curta", () => {
    const [ponta] = pontosPontaSeta({ tipo: "seta", x1: 10, y1: 10, x2: 15, y2: 12 }, COMPRIMENTO_LADO, ANGULO_GRAUS);
    expect(ponta).toEqual({ x: 15, y: 12 });
  });

  it("a ponta (1º ponto) é sempre exatamente (x2, y2) — seta longa", () => {
    const [ponta] = pontosPontaSeta(
      { tipo: "seta", x1: 0, y1: 0, x2: 2000, y2: 1200 },
      COMPRIMENTO_LADO,
      ANGULO_GRAUS,
    );
    expect(ponta).toEqual({ x: 2000, y: 1200 });
  });

  it("cada lado tem o comprimento fixo pedido — igual em seta curta e em seta longa", () => {
    const [pontaCurta, ladoCurta1] = pontosPontaSeta(
      { tipo: "seta", x1: 0, y1: 0, x2: 100, y2: 0 },
      COMPRIMENTO_LADO,
      ANGULO_GRAUS,
    );
    const [pontaLonga, ladoLonga1] = pontosPontaSeta(
      { tipo: "seta", x1: 0, y1: 0, x2: 5000, y2: 0 },
      COMPRIMENTO_LADO,
      ANGULO_GRAUS,
    );
    const distCurta = Math.hypot(ladoCurta1.x - pontaCurta.x, ladoCurta1.y - pontaCurta.y);
    const distLonga = Math.hypot(ladoLonga1.x - pontaLonga.x, ladoLonga1.y - pontaLonga.y);
    expect(distCurta).toBeCloseTo(COMPRIMENTO_LADO);
    expect(distLonga).toBeCloseTo(COMPRIMENTO_LADO); // mesmo tamanho fixo, não depende do comprimento da seta
  });

  it("para uma seta muito curta, os lados da ponta não ultrapassam o início (fica no máx. 60% do comprimento)", () => {
    const [ponta, lado1] = pontosPontaSeta({ tipo: "seta", x1: 0, y1: 0, x2: 10, y2: 0 }, COMPRIMENTO_LADO, ANGULO_GRAUS);
    const distancia = Math.hypot(lado1.x - ponta.x, lado1.y - ponta.y);
    expect(distancia).toBeLessThanOrEqual(10 * 0.6 + 1e-9);
  });

  it("cada segmento abre o ângulo pedido em relação à haste (natural, nem agulhado nem achatado)", () => {
    const g = { tipo: "seta" as const, x1: 0, y1: 0, x2: 100, y2: 0 }; // haste apontando para +x (0°)
    const [ponta, lado1, lado2] = pontosPontaSeta(g, COMPRIMENTO_LADO, ANGULO_GRAUS);
    // cada segmento vai da ponta de volta (~180°) abrindo ANGULO_GRAUS para cada lado.
    const angulo1 = Math.abs(normalizarGraus(angulo(ponta, lado1) - 180));
    const angulo2 = Math.abs(normalizarGraus(angulo(ponta, lado2) - 180));
    expect(angulo1).toBeCloseTo(ANGULO_GRAUS);
    expect(angulo2).toBeCloseTo(ANGULO_GRAUS);
  });

  it("os 2 segmentos são simétricos em torno do eixo da haste", () => {
    const [, lado1, lado2] = pontosPontaSeta(
      { tipo: "seta", x1: 0, y1: 0, x2: 100, y2: 0 },
      COMPRIMENTO_LADO,
      ANGULO_GRAUS,
    );
    // haste horizontal: os dois lados ficam acima/abaixo do eixo, mesma distância (em y).
    expect(lado1.y).toBeCloseTo(-lado2.y);
    expect(lado1.x).toBeCloseTo(lado2.x);
  });

  it("seta de comprimento zero não quebra — os 3 pontos colapsam no próprio ponto", () => {
    const pontos = pontosPontaSeta({ tipo: "seta", x1: 5, y1: 5, x2: 5, y2: 5 }, COMPRIMENTO_LADO, ANGULO_GRAUS);
    for (const p of pontos) {
      expect(p).toEqual({ x: 5, y: 5 });
    }
  });
});

