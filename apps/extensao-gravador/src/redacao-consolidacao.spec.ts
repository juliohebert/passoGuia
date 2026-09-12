import { describe, expect, it } from "vitest";
import { consolidarRedacao, LIMITE_FRESCOR_MS } from "./redacao-consolidacao";
import type { RelatorioFrame, Retangulo, SugestaoRegiao } from "./protocolo";

const VIEWPORT = { largura: 1280, altura: 800 };
const ALVO_RECT: Retangulo = { x: 10, y: 10, largura: 100, altura: 30 };
const INSTANTE_PRE = 1_700_000_000_000;

function sugestao(
  retangulo: Retangulo,
  confianca: SugestaoRegiao["confianca"] = "alta",
  motivo = "motivo de teste",
): SugestaoRegiao {
  return { retangulo, confianca, motivo };
}

function relatorio(overrides: Partial<RelatorioFrame> = {}): RelatorioFrame {
  return {
    viewport: VIEWPORT,
    sugestoes: [],
    iframes: [],
    shadowFechadoPossivel: false,
    instante: INSTANTE_PRE,
    ...overrides,
  };
}

describe("consolidarRedacao — sincronização com o screenshot PRE-AÇÃO", () => {
  it("sugestões PRE (relatório síncrono do frame de disparo) são usadas com o screenshot PRE", () => {
    const campoPre: Retangulo = { x: 50, y: 50, largura: 120, altura: 24 };
    const trigger = relatorio({ sugestoes: [sugestao(campoPre)], instante: INSTANTE_PRE });

    const cons = consolidarRedacao(0, "https://app/", trigger, ALVO_RECT, new Map(), new Map());

    expect(cons.redacaoIncompleta).toBe(false);
    expect(cons.sugestoes).toEqual([sugestao(campoPre)]);
    expect(cons.alvoRectTopo).toEqual(ALVO_RECT);
    expect(cons.viewportTopo).toEqual(VIEWPORT);
  });

  it("mudança de DOM após o clique (sub-frame respondeu tarde) não desloca a sugestão — descartada, não aplicada fora de posição", () => {
    const campoAntes: Retangulo = { x: 20, y: 20, largura: 80, altura: 20 };
    const campoDepoisDoReRender: Retangulo = { x: 400, y: 600, largura: 80, altura: 20 };

    const trigger = relatorio({
      sugestoes: [sugestao(campoAntes)],
      instante: INSTANTE_PRE,
      iframes: [{ rect: { x: 0, y: 0, largura: 400, altura: 300 }, src: "https://sub/painel" }],
    });
    // Sub-frame só respondeu bem depois do instante PRE (modal/re-render disparado pelo clique).
    const subFrameTarde = relatorio({
      sugestoes: [sugestao(campoDepoisDoReRender)],
      instante: INSTANTE_PRE + LIMITE_FRESCOR_MS + 50,
    });

    const outros = new Map([[1, subFrameTarde]]);
    const urls = new Map([[1, "https://sub/painel"]]);

    const cons = consolidarRedacao(0, "https://app/", trigger, ALVO_RECT, outros, urls);

    // Só a sugestão do trigger (síncrona, confiável) entra — a do sub-frame tardio é descartada.
    expect(cons.sugestoes).toEqual([sugestao(campoAntes)]);
    expect(cons.sugestoes).not.toContainEqual(
      expect.objectContaining({
        retangulo: expect.objectContaining({ x: campoDepoisDoReRender.x, y: campoDepoisDoReRender.y }),
      }),
    );
    expect(cons.redacaoIncompleta).toBe(false); // screenshot continua sendo produzido
    expect(cons.revisaoNecessaria).toBe(true); // mas marcado para revisão
    expect(cons.motivos.some((m) => m.includes("tarde demais"))).toBe(true);
  });

  it("sub-frame que respondeu DENTRO do limite de frescor tem suas sugestões incluídas normalmente", () => {
    const campoTrigger: Retangulo = { x: 20, y: 20, largura: 80, altura: 20 };
    const campoSubFrame: Retangulo = { x: 5, y: 5, largura: 60, altura: 18 };

    const trigger = relatorio({
      sugestoes: [sugestao(campoTrigger)],
      instante: INSTANTE_PRE,
      iframes: [{ rect: { x: 100, y: 100, largura: 400, altura: 300 }, src: "https://sub/painel" }],
    });
    const subFrameFresco = relatorio({
      sugestoes: [sugestao(campoSubFrame)],
      instante: INSTANTE_PRE + Math.floor(LIMITE_FRESCOR_MS / 2),
    });

    const outros = new Map([[1, subFrameFresco]]);
    const urls = new Map([[1, "https://sub/painel"]]);

    const cons = consolidarRedacao(0, "https://app/", trigger, ALVO_RECT, outros, urls);

    // Deslocada pelo offset do <iframe> (100,100): (5+100, 5+100) = (105,105).
    expect(cons.sugestoes).toContainEqual(
      sugestao({ x: 105, y: 105, largura: 60, altura: 18 }),
    );
    expect(cons.revisaoNecessaria).toBe(false);
  });

  it("falha de detecção automática (iframe visível não mapeável) preserva o screenshot e marca revisão — nunca descarta a imagem", () => {
    const trigger = relatorio({
      sugestoes: [sugestao({ x: 1, y: 1, largura: 10, altura: 10 })],
      instante: INSTANTE_PRE,
      iframes: [{ rect: { x: 0, y: 0, largura: 100, altura: 100 }, src: "https://outro-sub/x" }],
    });
    // Nenhum sub-frame corresponde ao src do iframe — não dá pra mapear com segurança.
    const cons = consolidarRedacao(0, "https://app/", trigger, ALVO_RECT, new Map(), new Map());

    // "Preserva o screenshot": ainda há viewport e sugestões suficientes para produzir a imagem.
    expect(cons.redacaoIncompleta).toBe(false);
    expect(cons.viewportTopo).toEqual(VIEWPORT);
    expect(cons.sugestoes.length).toBeGreaterThan(0);
    // "Marca revisão": a incerteza vira sinalização, não descarte.
    expect(cons.revisaoNecessaria).toBe(true);
    expect(cons.motivos.some((m) => m.includes("não mapeável"))).toBe(true);
  });

  it("sem relatório do frame de topo não há como gerar NENHUMA imagem — único caso de redacaoIncompleta=true", () => {
    const triggerDeSubFrame = relatorio({ instante: INSTANTE_PRE });
    // triggerFrameId != 0 e outros.get(0) ausente => frame de topo nunca respondeu.
    const cons = consolidarRedacao(
      2,
      "https://app/sub",
      triggerDeSubFrame,
      ALVO_RECT,
      new Map(),
      new Map(),
    );

    expect(cons.redacaoIncompleta).toBe(true);
    expect(cons.viewportTopo).toBeUndefined();
  });

  it("clique num sub-frame cujo <iframe> não é localizável no topo: alvoRectTopo fica ausente, mas sugestões/viewport continuam (imagem sem destaque, não sem imagem)", () => {
    const triggerDeSubFrame = relatorio({
      sugestoes: [sugestao({ x: 1, y: 1, largura: 5, altura: 5 })],
      instante: INSTANTE_PRE,
    });
    const relTopo = relatorio({ instante: INSTANTE_PRE, iframes: [] }); // nenhum <iframe> visível no topo

    const outros = new Map([[0, relTopo]]);
    const cons = consolidarRedacao(1, "https://sub/", triggerDeSubFrame, ALVO_RECT, outros, new Map());

    expect(cons.redacaoIncompleta).toBe(false);
    expect(cons.viewportTopo).toEqual(VIEWPORT);
    expect(cons.alvoRectTopo).toBeUndefined();
    expect(cons.revisaoNecessaria).toBe(true);
  });

  it("sugestões de baixa confiança entram em `sugestoes` normalmente — nunca borradas, só sinalizadas em outro lugar (servico.ts)", () => {
    const trigger = relatorio({
      sugestoes: [
        sugestao({ x: 1, y: 1, largura: 10, altura: 10 }, "alta"),
        sugestao({ x: 20, y: 20, largura: 10, altura: 10 }, "baixa", "vocabulário amplo/ambíguo"),
      ],
      instante: INSTANTE_PRE,
    });

    const cons = consolidarRedacao(0, "https://app/", trigger, ALVO_RECT, new Map(), new Map());

    expect(cons.sugestoes).toHaveLength(2);
    expect(cons.sugestoes.map((s) => s.confianca).sort()).toEqual(["alta", "baixa"]);
  });

  it("sem sugestões e sem outros motivos, revisaoNecessaria fica false", () => {
    const trigger = relatorio({
      sugestoes: [sugestao({ x: 1, y: 1, largura: 10, altura: 10 })],
      instante: INSTANTE_PRE,
    });

    const cons = consolidarRedacao(0, "https://app/", trigger, ALVO_RECT, new Map(), new Map());

    expect(cons.revisaoNecessaria).toBe(false);
    expect(cons.motivos).toEqual([]);
  });
});
