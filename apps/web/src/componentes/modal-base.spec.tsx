// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModalBase } from "./modal-base";

describe("ModalBase — casca reutilizada por preview e editor", () => {
  it("fechado: não renderiza nada", () => {
    render(
      <ModalBase aberto={false} onFechar={vi.fn()}>
        <p>conteúdo</p>
      </ModalBase>,
    );
    expect(screen.queryByText("conteúdo")).toBeNull();
  });

  it("aberto: painel ocupa quase a tela inteira (~92vw x 90vh)", () => {
    const { container } = render(
      <ModalBase aberto onFechar={vi.fn()}>
        <p>conteúdo</p>
      </ModalBase>,
    );
    const painel = container.querySelector(".w-\\[92vw\\]");
    expect(painel).not.toBeNull();
    expect(painel?.className).toContain("h-[90vh]");
  });

  it("o corpo (onde o conteúdo entra) consome o espaço restante (flex-1) — maior área útil possível", () => {
    render(
      <ModalBase aberto onFechar={vi.fn()}>
        <p>conteúdo</p>
      </ModalBase>,
    );
    const corpo = screen.getByText("conteúdo").parentElement;
    expect(corpo?.className).toContain("flex-1");
    expect(corpo?.className).toContain("overflow-auto");
  });

  it("fecha ao clicar no X", () => {
    const onFechar = vi.fn();
    render(
      <ModalBase aberto onFechar={onFechar}>
        <p>conteúdo</p>
      </ModalBase>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("fecha ao pressionar ESC", () => {
    const onFechar = vi.fn();
    render(
      <ModalBase aberto onFechar={onFechar}>
        <p>conteúdo</p>
      </ModalBase>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("fecha ao clicar no backdrop, mas não ao clicar dentro do painel", () => {
    const onFechar = vi.fn();
    const { container } = render(
      <ModalBase aberto onFechar={onFechar}>
        <p>conteúdo</p>
      </ModalBase>,
    );

    fireEvent.click(screen.getByText("conteúdo"));
    expect(onFechar).not.toHaveBeenCalled();

    fireEvent.click(container.firstChild as HTMLElement);
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("com título e rodapé, renderiza os dois; sem título, só o X flutuante", () => {
    const { rerender } = render(
      <ModalBase aberto onFechar={vi.fn()} titulo="Um título" rodape={<span>ações</span>}>
        <p>conteúdo</p>
      </ModalBase>,
    );
    expect(screen.getByText("Um título")).toBeInTheDocument();
    expect(screen.getByText("ações")).toBeInTheDocument();

    rerender(
      <ModalBase aberto onFechar={vi.fn()}>
        <p>conteúdo</p>
      </ModalBase>,
    );
    expect(screen.queryByText("Um título")).toBeNull();
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
  });
});
