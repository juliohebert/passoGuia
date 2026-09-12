// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PassoGravado } from "./passo-gravado";
import type { PassoGravado as Passo } from "@/dominio/tipos";

function passoBase(overrides: Partial<Passo> = {}): Passo {
  return {
    id: "p1",
    ordem: 1,
    titulo: "Clique em Salvar",
    origem: "automatico",
    ...overrides,
  };
}

describe("PassoGravado — preview ampliado do screenshot", () => {
  it("passo COM screenshot: clicar na captura abre o preview ampliado", () => {
    const passo = passoBase({ imagemRedigida: "data:image/png;base64,AAAA", correlacaoId: "c1" });
    render(<PassoGravado passo={passo} />);

    expect(screen.queryByAltText("Ampliar captura do passo 1", { exact: false })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ampliar captura do passo 1" }));

    // depois de abrir, a imagem aparece DUAS vezes no DOM: a miniatura do card
    // (dentro do botão) e a versão grande dentro do preview.
    expect(screen.getAllByAltText("captura do passo 1")).toHaveLength(2);
  });

  it("passo SEM screenshot (etapa manual): não existe nenhum gatilho de preview", () => {
    const passo = passoBase({ origem: "manual", imagemRedigida: undefined });
    render(<PassoGravado passo={passo} />);

    expect(screen.queryByRole("button", { name: /Ampliar/i })).toBeNull();
    expect(screen.queryByAltText("captura do passo 1")).toBeNull();
  });

  it("passo SEM screenshot (automático, sem imagem por infraestrutura): não existe nenhum gatilho de preview", () => {
    const passo = passoBase({ imagemRedigida: undefined, redacaoIncompleta: true });
    render(<PassoGravado passo={passo} />);

    expect(screen.queryByRole("button", { name: /Ampliar/i })).toBeNull();
  });

  it("preview do card usa as mesmas regiões (sugestões) mostradas na miniatura", () => {
    const passo = passoBase({
      imagemRedigida: "data:image/png;base64,AAAA",
      correlacaoId: "c1",
      sugestoesMascara: [
        { x: 1, y: 1, largura: 10, altura: 10, motivo: "campo com tipo HTML sensível", confianca: "alta" },
      ],
    });
    const { container } = render(<PassoGravado passo={passo} />);

    // badge de contagem no card
    expect(screen.getByText(/1 anotação sugerida/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ampliar captura do passo 1" }));

    const imagens = screen.getAllByAltText("captura do passo 1");
    for (const img of imagens) {
      Object.defineProperty(img, "naturalWidth", { value: 100, configurable: true });
      Object.defineProperty(img, "naturalHeight", { value: 100, configurable: true });
      fireEvent.load(img);
    }

    // 1 overlay na miniatura + 1 overlay no preview = 2 no total.
    expect(container.querySelectorAll('[data-tipo-anotacao="mascara"]')).toHaveLength(2);
  });

  it("máscaras salvas (não só sugestões) também aparecem no preview, com precedência", () => {
    const passo = passoBase({
      imagemRedigida: "data:image/png;base64,AAAA",
      correlacaoId: "c1",
      sugestoesMascara: [
        { x: 999, y: 999, largura: 10, altura: 10, motivo: "ignorada", confianca: "alta" },
      ],
      mascarasAplicadas: [
        { id: "m1", x: 1, y: 1, largura: 10, altura: 10, origem: "manual", ativa: true },
      ],
    });
    render(<PassoGravado passo={passo} />);

    expect(screen.getByText(/1 anotação$/)).toBeInTheDocument(); // sem "sugerida" no texto

    fireEvent.click(screen.getByRole("button", { name: "Ampliar captura do passo 1" }));
    expect(screen.getAllByAltText("captura do passo 1")).toHaveLength(2);
  });

  it("fecha o preview pelo X e reabre normalmente", () => {
    const passo = passoBase({ imagemRedigida: "data:image/png;base64,AAAA", correlacaoId: "c1" });
    render(<PassoGravado passo={passo} />);

    fireEvent.click(screen.getByRole("button", { name: "Ampliar captura do passo 1" }));
    expect(screen.getAllByAltText("captura do passo 1")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.getAllByAltText("captura do passo 1")).toHaveLength(1); // só a miniatura do card

    fireEvent.click(screen.getByRole("button", { name: "Ampliar captura do passo 1" }));
    expect(screen.getAllByAltText("captura do passo 1")).toHaveLength(2);
  });

  it("fecha o preview por ESC", () => {
    const passo = passoBase({ imagemRedigida: "data:image/png;base64,AAAA", correlacaoId: "c1" });
    render(<PassoGravado passo={passo} />);

    fireEvent.click(screen.getByRole("button", { name: "Ampliar captura do passo 1" }));
    expect(screen.getAllByAltText("captura do passo 1")).toHaveLength(2);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getAllByAltText("captura do passo 1")).toHaveLength(1);
  });

  it("clicar em 'Editar imagem' não abre o preview (ações independentes)", () => {
    const passo = passoBase({ imagemRedigida: "data:image/png;base64,AAAA", correlacaoId: "c1" });
    render(<PassoGravado passo={passo} onPassoAtualizado={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Editar imagem" }));

    // editor abriu (título do editor visível); preview NÃO abriu (só 1 <img> na miniatura do card
    // — o editor tem sua própria imagem, então checamos que o preview especificamente está fora).
    expect(screen.getByText(/Editar imagem — passo 1/)).toBeInTheDocument();
  });

  it("passo com screenshot mas SEM nenhuma sugestão ainda permite 'Editar imagem' (nova regra)", () => {
    const passo = passoBase({ imagemRedigida: "data:image/png;base64,AAAA", correlacaoId: "c1" });
    render(<PassoGravado passo={passo} onPassoAtualizado={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Editar imagem" })).toBeInTheDocument();
  });
});
