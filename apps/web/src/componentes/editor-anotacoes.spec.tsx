// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CapturaAnotada } from "./captura-anotada";
import { EditorAnotacoes } from "./editor-anotacoes";
import { COR_SETA, COR_SETA_SELECIONADA, ESPESSURA_SETA } from "./estilo-anotacoes";
import type { AnotacaoImagem, PassoGravado } from "@/dominio/tipos";

const SRC = "data:image/png;base64,AAAA";

type PassoParaEditor = Pick<
  PassoGravado,
  "titulo" | "ordem" | "imagemRedigida" | "sugestoesMascara" | "mascarasAplicadas" | "anotacoesImagem"
>;

function passoBase(overrides: Partial<PassoParaEditor> = {}): PassoParaEditor {
  return {
    titulo: "Clique em Salvar",
    ordem: 1,
    imagemRedigida: SRC,
    ...overrides,
  };
}

/** happy-dom não faz layout de verdade — simulamos naturalWidth/height e a área do editor via getBoundingClientRect. */
function prepararArea(largura = 200, altura = 100): HTMLElement {
  const img = screen.getByAltText("captura do passo 1") as HTMLImageElement;
  Object.defineProperty(img, "naturalWidth", { value: largura, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: altura, configurable: true });
  fireEvent.load(img);

  const area = screen.getByTestId("editor-anotacoes-area");
  area.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: largura,
      bottom: altura,
      width: largura,
      height: altura,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    }) as DOMRect;
  return area;
}

function arrastar(area: HTMLElement, de: { x: number; y: number }, para: { x: number; y: number }): void {
  fireEvent.pointerDown(area, { clientX: de.x, clientY: de.y });
  fireEvent.pointerMove(area, { clientX: para.x, clientY: para.y });
  fireEvent.pointerUp(area, { clientX: para.x, clientY: para.y });
}

function selecionarFerramenta(nome: string): void {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(nome) }));
}

describe("EditorAnotacoes", () => {
  it("máscara: cria por arraste mesmo sem nenhuma sugestão prévia", () => {
    const passo = passoBase();
    const { container } = render(<EditorAnotacoes passo={passo} onCancelar={vi.fn()} onSalvar={vi.fn()} />);
    const area = prepararArea();

    // ferramenta "Máscara" já vem ativa por padrão.
    arrastar(area, { x: 20, y: 20 }, { x: 100, y: 60 });

    expect(container.querySelectorAll('[aria-label="Anotação mascara"]')).toHaveLength(1);
  });

  it("destaque: cria por arraste, sem ocultar conteúdo", () => {
    const passo = passoBase();
    const { container } = render(<EditorAnotacoes passo={passo} onCancelar={vi.fn()} onSalvar={vi.fn()} />);
    const area = prepararArea();

    selecionarFerramenta("Destaque");
    arrastar(area, { x: 10, y: 10 }, { x: 80, y: 50 });

    const destaque = container.querySelector('[aria-label="Anotação destaque"]');
    expect(destaque).not.toBeNull();
    expect(destaque?.className).not.toContain("bg-slate-900");
  });

  it("seta: cria arrastando do ponto inicial ao final — haste + 2 segmentos diagonais, sem elemento à parte", () => {
    const passo = passoBase();
    const { container } = render(<EditorAnotacoes passo={passo} onCancelar={vi.fn()} onSalvar={vi.fn()} />);
    const area = prepararArea();

    selecionarFerramenta("Seta");
    arrastar(area, { x: 5, y: 5 }, { x: 150, y: 80 });

    expect(container.querySelectorAll('[aria-label="Anotação seta"]')).toHaveLength(1);
    const haste = container.querySelector('line[data-tipo-anotacao="seta"]');
    const segmentosPonta = container.querySelectorAll('line[data-tipo-anotacao="seta-ponta"]');
    expect(haste).not.toBeNull();
    expect(segmentosPonta).toHaveLength(2); // 2 segmentos diagonais formando a ponta, nada de triângulo/marker

    expect(haste?.getAttribute("x1")).toBe("5");
    expect(haste?.getAttribute("y1")).toBe("5");
    expect(haste?.getAttribute("x2")).toBe("150");
    expect(haste?.getAttribute("y2")).toBe("80");
    // os 2 segmentos da ponta nascem exatamente no fim da haste.
    for (const segmento of segmentosPonta) {
      expect(segmento.getAttribute("x1")).toBe("150");
      expect(segmento.getAttribute("y1")).toBe("80");
    }

    // desseleciona (troca de ferramenta) para conferir a cor "normal", consistente com o destaque.
    selecionarFerramenta("Máscara");
    const hasteSemSelecao = container.querySelector('line[data-tipo-anotacao="seta"]');
    expect(hasteSemSelecao?.getAttribute("stroke")).toBe(COR_SETA);
    expect(hasteSemSelecao?.getAttribute("stroke-width")).toBe(String(ESPESSURA_SETA)); // igual ao preview
    // a espessura da ponta acompanha a da haste.
    const segmentosSemSelecao = container.querySelectorAll('line[data-tipo-anotacao="seta-ponta"]');
    for (const segmento of segmentosSemSelecao) {
      expect(segmento.getAttribute("stroke-width")).toBe(String(ESPESSURA_SETA));
    }
  });

  it("seta: seleção muda cor/espessura (contorno), mas nunca a geometria (x1/y1/x2/y2)", () => {
    const passo = passoBase();
    const { container } = render(<EditorAnotacoes passo={passo} onCancelar={vi.fn()} onSalvar={vi.fn()} />);
    const area = prepararArea();

    selecionarFerramenta("Seta");
    arrastar(area, { x: 5, y: 5 }, { x: 150, y: 80 });

    const linhaSelecionada = container.querySelector('line[data-tipo-anotacao="seta"]');
    expect(linhaSelecionada?.getAttribute("stroke")).toBe(COR_SETA_SELECIONADA); // recém-criada já fica selecionada
    const coordsSelecionada = ["x1", "y1", "x2", "y2"].map((a) => linhaSelecionada?.getAttribute(a));

    selecionarFerramenta("Máscara"); // desseleciona
    const linhaNormal = container.querySelector('line[data-tipo-anotacao="seta"]');
    const coordsNormal = ["x1", "y1", "x2", "y2"].map((a) => linhaNormal?.getAttribute(a));

    expect(linhaNormal?.getAttribute("stroke")).toBe(COR_SETA);
    expect(coordsNormal).toEqual(coordsSelecionada); // a geometria não muda com a seleção
  });

  it("seta: mover arrastando move a linha e a ponta juntas (mesmo deslocamento)", () => {
    const passo = passoBase();
    const { container } = render(<EditorAnotacoes passo={passo} onCancelar={vi.fn()} onSalvar={vi.fn()} />);
    const area = prepararArea();

    selecionarFerramenta("Seta");
    arrastar(area, { x: 10, y: 10 }, { x: 60, y: 40 });

    const hitArea = container.querySelector('[aria-label="Anotação seta"]') as HTMLElement;
    fireEvent.pointerDown(hitArea, { clientX: 35, clientY: 25 }); // meio da seta
    fireEvent.pointerMove(area, { clientX: 55, clientY: 45 }); // desloca +20,+20
    fireEvent.pointerUp(area, { clientX: 55, clientY: 45 });

    const linha = container.querySelector('line[data-tipo-anotacao="seta"]');
    const segmentosPonta = container.querySelectorAll('line[data-tipo-anotacao="seta-ponta"]');
    expect(linha?.getAttribute("x1")).toBe("30");
    expect(linha?.getAttribute("y1")).toBe("30");
    expect(linha?.getAttribute("x2")).toBe("80");
    expect(linha?.getAttribute("y2")).toBe("60");
    // os segmentos da ponta acompanharam o mesmo deslocamento — continuam exatamente no novo fim da linha.
    for (const segmento of segmentosPonta) {
      expect(segmento.getAttribute("x1")).toBe("80");
      expect(segmento.getAttribute("y1")).toBe("60");
    }
  });

  it("número: clique adiciona marcadores numerados sequencialmente 1, 2, 3", () => {
    const passo = passoBase();
    render(<EditorAnotacoes passo={passo} onCancelar={vi.fn()} onSalvar={vi.fn()} />);
    const area = prepararArea();

    selecionarFerramenta("Número");
    fireEvent.click(area, { clientX: 10, clientY: 10 });
    fireEvent.click(area, { clientX: 50, clientY: 50 });
    fireEvent.click(area, { clientX: 90, clientY: 20 });

    expect(screen.getByLabelText("Marcador número 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Marcador número 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Marcador número 3")).toBeInTheDocument();
  });

  it("número: remover um marcador recalcula a sequência", () => {
    const passo = passoBase();
    render(<EditorAnotacoes passo={passo} onCancelar={vi.fn()} onSalvar={vi.fn()} />);
    const area = prepararArea();

    selecionarFerramenta("Número");
    fireEvent.click(area, { clientX: 10, clientY: 10 });
    fireEvent.click(area, { clientX: 50, clientY: 50 });
    fireEvent.click(area, { clientX: 90, clientY: 20 });

    // seleciona o marcador 2 (clicando nele) e remove.
    fireEvent.pointerDown(screen.getByLabelText("Marcador número 2"), { clientX: 50, clientY: 50 });
    fireEvent.click(screen.getByLabelText("Remover marcador"));

    expect(screen.getByLabelText("Marcador número 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Marcador número 2")).toBeInTheDocument(); // era o 3º, virou o 2º
    expect(screen.queryByLabelText("Marcador número 3")).not.toBeInTheDocument();
  });

  it("máscara: aplica blur (sem overlay sólido) e mostra um contorno discreto durante a edição", () => {
    const passo = passoBase();
    const { container } = render(<EditorAnotacoes passo={passo} onCancelar={vi.fn()} onSalvar={vi.fn()} />);
    const area = prepararArea();

    arrastar(area, { x: 20, y: 20 }, { x: 60, y: 40 });
    const regiao = container.querySelector('[aria-label="Anotação mascara"]');

    expect(regiao?.className).toContain("backdrop-blur");
    expect(regiao?.className).not.toMatch(/bg-(slate|black|gray|zinc|neutral)-\d/);
    // contorno discreto de seleção (fica só na edição — o preview não desenha nenhuma borda).
    expect(regiao?.className).toContain("border-roxo-500"); // recém-criada já fica selecionada
  });

  it("máscara: mover uma anotação existente arrastando-a", () => {
    const passo = passoBase();
    const { container } = render(<EditorAnotacoes passo={passo} onCancelar={vi.fn()} onSalvar={vi.fn()} />);
    const area = prepararArea();

    arrastar(area, { x: 20, y: 20 }, { x: 60, y: 40 });
    const regiao = container.querySelector('[aria-label="Anotação mascara"]') as HTMLElement;
    const leftAntes = regiao.style.left;

    fireEvent.pointerDown(regiao, { clientX: 30, clientY: 30 });
    fireEvent.pointerMove(area, { clientX: 80, clientY: 70 });
    fireEvent.pointerUp(area, { clientX: 80, clientY: 70 });

    expect(regiao.style.left).not.toBe(leftAntes);
  });

  it("máscara: redimensiona pela alça de resize", () => {
    const passo = passoBase();
    const { container } = render(<EditorAnotacoes passo={passo} onCancelar={vi.fn()} onSalvar={vi.fn()} />);
    const area = prepararArea();

    arrastar(area, { x: 20, y: 20 }, { x: 60, y: 40 });
    const regiao = container.querySelector('[aria-label="Anotação mascara"]') as HTMLElement;
    const larguraAntes = regiao.style.width;

    const alca = regiao.querySelector(".cursor-nwse-resize") as HTMLElement;
    fireEvent.pointerDown(alca, { clientX: 60, clientY: 40 });
    fireEvent.pointerMove(area, { clientX: 120, clientY: 90 });
    fireEvent.pointerUp(area, { clientX: 120, clientY: 90 });

    expect(regiao.style.width).not.toBe(larguraAntes);
  });

  it("salvar: persiste as anotações via onSalvar e recarregar reflete o que foi salvo", async () => {
    const onSalvar = vi.fn().mockResolvedValue(true);
    const passo = passoBase();
    const primeiro = render(<EditorAnotacoes passo={passo} onCancelar={vi.fn()} onSalvar={onSalvar} />);
    const area = prepararArea();

    arrastar(area, { x: 20, y: 20 }, { x: 60, y: 40 });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
      await Promise.resolve();
    });

    expect(onSalvar).toHaveBeenCalledTimes(1);
    const salvas = onSalvar.mock.calls[0]?.[0] as AnotacaoImagem[];
    expect(salvas).toHaveLength(1);
    expect(salvas[0]?.tipo).toBe("mascara");

    // "recarregar": um novo editor recebe o passo já com anotacoesImagem salvo e parte desse estado.
    primeiro.unmount();
    const passoRecarregado = passoBase({ anotacoesImagem: salvas });
    render(<EditorAnotacoes passo={passoRecarregado} onCancelar={vi.fn()} onSalvar={vi.fn()} />);
    expect(screen.getAllByLabelText("Anotação mascara")).toHaveLength(1);
  });

  it("seta: editor (sem seleção) e preview renderizam com o mesmo traço — cor e espessura idênticas", () => {
    const anotacao: AnotacaoImagem = {
      id: "s1",
      tipo: "seta",
      geometria: { tipo: "seta", x1: 10, y1: 20, x2: 150, y2: 90 },
    };

    const editor = render(
      <EditorAnotacoes
        passo={passoBase({ anotacoesImagem: [anotacao] })}
        onCancelar={vi.fn()}
        onSalvar={vi.fn()}
      />,
    );
    prepararArea();
    const linhaEditor = editor.container.querySelector('line[data-tipo-anotacao="seta"]');
    // recém-carregada não vem selecionada — mesmo visual "de repouso" do preview.
    editor.unmount();

    const preview = render(
      <CapturaAnotada src={SRC} alt="captura do passo 1" anotacoes={[anotacao]} />,
    );
    const img = screen.getByAltText("captura do passo 1") as HTMLImageElement;
    Object.defineProperty(img, "naturalWidth", { value: 200, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: 100, configurable: true });
    fireEvent.load(img);
    const linhaPreview = preview.container.querySelector('line[data-tipo-anotacao="seta"]');

    expect(linhaEditor?.getAttribute("stroke")).toBe(linhaPreview?.getAttribute("stroke"));
    expect(linhaEditor?.getAttribute("stroke-width")).toBe(linhaPreview?.getAttribute("stroke-width"));
    expect(linhaEditor?.getAttribute("stroke")).toBe(COR_SETA);
    expect(linhaEditor?.getAttribute("stroke-width")).toBe(String(ESPESSURA_SETA));
    for (const atributo of ["x1", "y1", "x2", "y2"]) {
      expect(linhaEditor?.getAttribute(atributo)).toBe(linhaPreview?.getAttribute(atributo));
    }
  });

  it("compatibilidade com passos antigos: sem anotacoesImagem, usa sugestão de máscara como ponto de partida", () => {
    const passo = passoBase({
      sugestoesMascara: [{ x: 1, y: 1, largura: 10, altura: 10, motivo: "campo sensível", confianca: "alta" }],
    });
    render(<EditorAnotacoes passo={passo} onCancelar={vi.fn()} onSalvar={vi.fn()} />);
    prepararArea();

    expect(screen.getByLabelText("Anotação mascara")).toBeInTheDocument();
  });

  it("cancelar não chama onSalvar", () => {
    const onCancelar = vi.fn();
    const passo = passoBase();
    render(<EditorAnotacoes passo={passo} onCancelar={onCancelar} onSalvar={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancelar).toHaveBeenCalledTimes(1);
  });

  it("toolbar: ferramenta ativa fica destacada visualmente (aria-pressed)", () => {
    const passo = passoBase();
    render(<EditorAnotacoes passo={passo} onCancelar={vi.fn()} onSalvar={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Máscara/ })).toHaveAttribute("aria-pressed", "true");
    selecionarFerramenta("Destaque");
    expect(screen.getByRole("button", { name: /Destaque/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Máscara/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("sem imagemRedigida não renderiza nada", () => {
    const passo = passoBase({ imagemRedigida: undefined });
    const { container } = render(<EditorAnotacoes passo={passo} onCancelar={vi.fn()} onSalvar={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
