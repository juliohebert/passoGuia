// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewCaptura } from "./preview-captura";
import type { AnotacaoImagem, GeometriaRetangulo } from "@/dominio/tipos";

const SRC = "data:image/png;base64,AAAA";

function mascara(overrides: Partial<Omit<GeometriaRetangulo, "tipo">> = {}): AnotacaoImagem {
  return {
    id: "a1",
    tipo: "mascara",
    geometria: { tipo: "retangulo", x: 0, y: 0, largura: 50, altura: 20, ...overrides },
  };
}

/** happy-dom não carrega a imagem de verdade — disparamos onLoad manualmente com dimensões conhecidas. */
function carregarImagem(alt: string, largura = 200, altura = 100): void {
  const img = screen.getByAltText(alt) as HTMLImageElement;
  Object.defineProperty(img, "naturalWidth", { value: largura, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: altura, configurable: true });
  fireEvent.load(img);
}

describe("PreviewCaptura", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("fechado: não renderiza a imagem nem nada do modal", () => {
    render(
      <PreviewCaptura aberto={false} onFechar={vi.fn()} src={SRC} alt="captura do passo 1" anotacoes={[]} />,
    );
    expect(screen.queryByAltText("captura do passo 1")).not.toBeInTheDocument();
  });

  it("aberto: mostra a imagem em tamanho maior", () => {
    render(
      <PreviewCaptura aberto={true} onFechar={vi.fn()} src={SRC} alt="captura do passo 1" anotacoes={[]} />,
    );
    expect(screen.getByAltText("captura do passo 1")).toBeInTheDocument();
  });

  it("abre em tamanho quase de tela cheia (~92vw x 90vh)", () => {
    const { container } = render(
      <PreviewCaptura aberto onFechar={vi.fn()} src={SRC} alt="captura do passo 1" anotacoes={[]} />,
    );
    const painel = container.querySelector(".w-\\[92vw\\]");
    expect(painel).not.toBeNull();
    expect(painel?.className).toContain("h-[90vh]");
  });

  it("fecha ao clicar no botão X", () => {
    const onFechar = vi.fn();
    render(<PreviewCaptura aberto onFechar={onFechar} src={SRC} alt="captura" anotacoes={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("fecha ao pressionar ESC", () => {
    const onFechar = vi.fn();
    render(<PreviewCaptura aberto onFechar={onFechar} src={SRC} alt="captura" anotacoes={[]} />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("não fecha em outras teclas", () => {
    const onFechar = vi.fn();
    render(<PreviewCaptura aberto onFechar={onFechar} src={SRC} alt="captura" anotacoes={[]} />);

    fireEvent.keyDown(window, { key: "Enter" });

    expect(onFechar).not.toHaveBeenCalled();
  });

  it("fecha ao clicar no backdrop (fora do painel)", () => {
    const onFechar = vi.fn();
    const { container } = render(
      <PreviewCaptura aberto onFechar={onFechar} src={SRC} alt="captura" anotacoes={[]} />,
    );

    fireEvent.click(container.firstChild as HTMLElement);

    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("clique DENTRO do painel (na imagem) não fecha", () => {
    const onFechar = vi.fn();
    render(<PreviewCaptura aberto onFechar={onFechar} src={SRC} alt="captura" anotacoes={[]} />);

    fireEvent.click(screen.getByAltText("captura"));

    expect(onFechar).not.toHaveBeenCalled();
  });

  it("não deixa de renderizar quando fechado e reaberto depois de ESC", () => {
    const onFechar = vi.fn();
    const { rerender } = render(
      <PreviewCaptura aberto onFechar={onFechar} src={SRC} alt="captura" anotacoes={[]} />,
    );
    rerender(<PreviewCaptura aberto={false} onFechar={onFechar} src={SRC} alt="captura" anotacoes={[]} />);
    expect(screen.queryByAltText("captura")).not.toBeInTheDocument();

    rerender(<PreviewCaptura aberto={true} onFechar={onFechar} src={SRC} alt="captura" anotacoes={[]} />);
    expect(screen.getByAltText("captura")).toBeInTheDocument();
  });

  it("renderiza máscaras: aplica blur por anotação, sem alterar a imagem original", () => {
    const { container } = render(
      <PreviewCaptura
        aberto
        onFechar={vi.fn()}
        src={SRC}
        alt="captura com anotacoes"
        anotacoes={[
          { ...mascara({ x: 0, y: 0 }), id: "a1" },
          { ...mascara({ x: 60, y: 30, largura: 40, altura: 10 }), id: "a2" },
        ]}
      />,
    );
    carregarImagem("captura com anotacoes");

    const img = screen.getByAltText("captura com anotacoes") as HTMLImageElement;
    expect(img.src).toContain(SRC); // a própria imagem nunca é trocada/reprocessada
    expect(container.querySelectorAll('[data-tipo-anotacao="mascara"]')).toHaveLength(2);
  });

  it("máscara: aplica blur forte via backdrop-filter, sem nenhum overlay sólido (preto/cinza) por baixo", () => {
    const { container } = render(
      <PreviewCaptura aberto onFechar={vi.fn()} src={SRC} alt="captura blur" anotacoes={[mascara()]} />,
    );
    carregarImagem("captura blur");

    const overlay = container.querySelector('[data-tipo-anotacao="mascara"]');
    expect(overlay?.className).toContain("backdrop-blur");
    expect(overlay?.className).not.toMatch(/bg-(slate|black|gray|zinc|neutral)-\d/);
  });

  it("máscara: preview não mostra nenhum contorno de seleção (isso é só do editor)", () => {
    const { container } = render(
      <PreviewCaptura aberto onFechar={vi.fn()} src={SRC} alt="captura sem selecao" anotacoes={[mascara()]} />,
    );
    carregarImagem("captura sem selecao");

    const overlay = container.querySelector('[data-tipo-anotacao="mascara"]');
    expect(overlay?.className).not.toContain("border-roxo");
    expect(overlay?.className).not.toContain("ring-roxo");
  });

  it("renderiza os 4 tipos de anotação (máscara, destaque, seta, número)", () => {
    const { container } = render(
      <PreviewCaptura
        aberto
        onFechar={vi.fn()}
        src={SRC}
        alt="captura completa"
        anotacoes={[
          { id: "m1", tipo: "mascara", geometria: { tipo: "retangulo", x: 0, y: 0, largura: 10, altura: 10 } },
          { id: "d1", tipo: "destaque", geometria: { tipo: "retangulo", x: 20, y: 20, largura: 10, altura: 10 } },
          { id: "s1", tipo: "seta", geometria: { tipo: "seta", x1: 0, y1: 0, x2: 50, y2: 50 } },
          { id: "n1", tipo: "numero", geometria: { tipo: "ponto", x: 5, y: 5 }, ordem: 1 },
        ]}
      />,
    );
    carregarImagem("captura completa");

    expect(container.querySelectorAll('[data-tipo-anotacao="mascara"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-tipo-anotacao="destaque"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-tipo-anotacao="seta"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-tipo-anotacao="numero"]')).toHaveLength(1);
    expect(screen.getByText("1")).toBeInTheDocument(); // número do marcador
  });

  it("destaque nunca oculta o conteúdo (sem preenchimento sólido, só contorno/realce leve)", () => {
    const { container } = render(
      <PreviewCaptura
        aberto
        onFechar={vi.fn()}
        src={SRC}
        alt="captura destaque"
        anotacoes={[{ id: "d1", tipo: "destaque", geometria: { tipo: "retangulo", x: 0, y: 0, largura: 10, altura: 10 } }]}
      />,
    );
    carregarImagem("captura destaque");

    const destaque = container.querySelector('[data-tipo-anotacao="destaque"]');
    expect(destaque?.className).not.toContain("bg-slate-900");
    expect(destaque?.className).toContain("border-amber-400");
  });

  it("seta: uma haste + 2 segmentos diagonais na ponta (SVG puro, sem marker/div/preenchimento à parte)", () => {
    const { container } = render(
      <PreviewCaptura
        aberto
        onFechar={vi.fn()}
        src={SRC}
        alt="captura seta unica"
        anotacoes={[{ id: "s1", tipo: "seta", geometria: { tipo: "seta", x1: 10, y1: 10, x2: 60, y2: 60 } }]}
      />,
    );
    carregarImagem("captura seta unica", 200, 200);

    const haste = container.querySelector('line[data-tipo-anotacao="seta"]');
    const segmentosPonta = container.querySelectorAll('line[data-tipo-anotacao="seta-ponta"]');
    expect(haste).not.toBeNull();
    expect(segmentosPonta).toHaveLength(2); // 2 segmentos diagonais formando a ponta, nada de triângulo/polygon
    expect(container.querySelectorAll("polygon, marker, defs").length).toBe(0); // nada de preenchimento/marker

    // a haste sai exatamente do início e termina exatamente no ponto final.
    expect(haste?.getAttribute("x1")).toBe("10");
    expect(haste?.getAttribute("y1")).toBe("10");
    expect(haste?.getAttribute("x2")).toBe("60");
    expect(haste?.getAttribute("y2")).toBe("60");

    // os 2 segmentos da ponta nascem exatamente no ponto final — nunca ficam soltos/deslocados.
    for (const segmento of segmentosPonta) {
      expect(segmento.getAttribute("x1")).toBe("60");
      expect(segmento.getAttribute("y1")).toBe("60");
      // espessura da ponta acompanha a da haste.
      expect(segmento.getAttribute("stroke-width")).toBe(haste?.getAttribute("stroke-width"));
    }
  });

  it("seta: funciona bem em horizontal, vertical, diagonal, curta e longa (mesma técnica, geometria correta, ponta sempre conectada)", () => {
    const casos: { id: string; geometria: { x1: number; y1: number; x2: number; y2: number } }[] = [
      { id: "horizontal", geometria: { x1: 10, y1: 50, x2: 90, y2: 50 } },
      { id: "vertical", geometria: { x1: 50, y1: 10, x2: 50, y2: 90 } },
      { id: "diagonal", geometria: { x1: 0, y1: 0, x2: 100, y2: 100 } },
      { id: "curta", geometria: { x1: 10, y1: 10, x2: 15, y2: 12 } },
      { id: "longa", geometria: { x1: 0, y1: 0, x2: 500, y2: 300 } },
    ];
    const { container } = render(
      <PreviewCaptura
        aberto
        onFechar={vi.fn()}
        src={SRC}
        alt="captura setas variadas"
        anotacoes={casos.map((c) => ({
          id: c.id,
          tipo: "seta" as const,
          geometria: { tipo: "seta" as const, ...c.geometria },
        }))}
      />,
    );
    carregarImagem("captura setas variadas", 600, 400);

    const linhas = container.querySelectorAll('line[data-tipo-anotacao="seta"]');
    const segmentosPonta = container.querySelectorAll('line[data-tipo-anotacao="seta-ponta"]');
    expect(linhas).toHaveLength(casos.length);
    expect(segmentosPonta).toHaveLength(casos.length * 2); // 2 segmentos por seta
    linhas.forEach((linha, i) => {
      const caso = casos[i];
      // mesma espessura discreta e constante em todos os casos — não varia com o comprimento/ângulo da seta.
      expect(linha.getAttribute("stroke-width")).toBe("3.5");
      expect(linha.getAttribute("x2")).toBe(String(caso?.geometria.x2));
      expect(linha.getAttribute("y2")).toBe(String(caso?.geometria.y2));
      // os 2 segmentos da ponta desta seta nascem sempre exatamente no ponto final dela.
      const [seg1, seg2] = [segmentosPonta[i * 2], segmentosPonta[i * 2 + 1]];
      expect(seg1?.getAttribute("x1")).toBe(String(caso?.geometria.x2));
      expect(seg1?.getAttribute("y1")).toBe(String(caso?.geometria.y2));
      expect(seg2?.getAttribute("x1")).toBe(String(caso?.geometria.x2));
      expect(seg2?.getAttribute("y1")).toBe(String(caso?.geometria.y2));
    });
  });

  it("sem nenhuma anotação, não desenha overlay nenhum", () => {
    const { container } = render(
      <PreviewCaptura aberto onFechar={vi.fn()} src={SRC} alt="captura sem anotacoes" anotacoes={[]} />,
    );
    carregarImagem("captura sem anotacoes");

    expect(container.querySelectorAll("[data-tipo-anotacao]")).toHaveLength(0);
  });

  it("máscara acompanha corretamente imagens de tamanhos naturais diferentes (posição sempre em %, escalada pela imagem)", () => {
    const anotacao = mascara({ x: 50, y: 25, largura: 100, altura: 50 });

    const { container: pequena } = render(
      <PreviewCaptura aberto onFechar={vi.fn()} src={SRC} alt="pequena" anotacoes={[anotacao]} />,
    );
    carregarImagem("pequena", 400, 200);
    const overlayPequena = pequena.querySelector('[data-tipo-anotacao="mascara"]') as HTMLElement;
    expect(overlayPequena.style.left).toBe("12.5%");
    expect(overlayPequena.style.top).toBe("12.5%");
    expect(overlayPequena.style.width).toBe("25%");
    expect(overlayPequena.style.height).toBe("25%");

    const { container: grande } = render(
      <PreviewCaptura aberto onFechar={vi.fn()} src={SRC} alt="grande" anotacoes={[anotacao]} />,
    );
    carregarImagem("grande", 4000, 2000); // imagem 10x maior — mesma região em px de imagem = fração menor
    const overlayGrande = grande.querySelector('[data-tipo-anotacao="mascara"]') as HTMLElement;
    expect(overlayGrande.style.left).toBe("1.25%");
    expect(overlayGrande.style.top).toBe("1.25%");
    expect(overlayGrande.style.width).toBe("2.5%");
    expect(overlayGrande.style.height).toBe("2.5%");
  });

  it("máscara alinhada de forma idêntica quando a MESMA imagem é vista em telas/containers diferentes", () => {
    // O cálculo usa só naturalWidth/naturalHeight (nunca o tamanho renderido
    // do container/tela) — então, para a mesma imagem, a posição em % é
    // sempre a mesma, não importa o quão grande/pequeno o modal é desenhado.
    const anotacao = mascara({ x: 20, y: 10, largura: 40, altura: 20 });
    const { container: c1 } = render(
      <PreviewCaptura aberto onFechar={vi.fn()} src={SRC} alt="tela A" anotacoes={[anotacao]} />,
    );
    carregarImagem("tela A", 200, 100);
    const overlay1 = c1.querySelector('[data-tipo-anotacao="mascara"]') as HTMLElement;

    const { container: c2 } = render(
      <PreviewCaptura aberto onFechar={vi.fn()} src={SRC} alt="tela B" anotacoes={[anotacao]} />,
    );
    carregarImagem("tela B", 200, 100); // mesma imagem, "modal" hipoteticamente em outro tamanho de tela
    const overlay2 = c2.querySelector('[data-tipo-anotacao="mascara"]') as HTMLElement;

    expect(overlay2.style.left).toBe(overlay1.style.left);
    expect(overlay2.style.top).toBe(overlay1.style.top);
    expect(overlay2.style.width).toBe(overlay1.style.width);
    expect(overlay2.style.height).toBe(overlay1.style.height);
  });
});
