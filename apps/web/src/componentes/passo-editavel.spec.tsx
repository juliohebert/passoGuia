// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PassoEditavel } from "./passo-editavel";
import type { PassoGravado as Passo } from "@/dominio/tipos";

function passoBase(sobrescritas: Partial<Passo> = {}): Passo {
  return {
    id: "p1",
    correlacaoId: "c1",
    ordem: 1,
    titulo: "Clique em Salvar",
    origem: "automatico",
    ...sobrescritas,
  };
}

function renderizar(sobrescritas: Partial<Passo> = {}, extras: Partial<Record<string, unknown>> = {}) {
  const onSalvarTituloDescricao = vi.fn().mockResolvedValue(true);
  const onExcluir = vi.fn();
  const onPassoAtualizado = vi.fn();
  const onArrastarInicio = vi.fn();
  const onSoltarSobre = vi.fn();

  const utilitarios = render(
    <PassoEditavel
      sessaoId="s1"
      passo={passoBase(sobrescritas)}
      onSalvarTituloDescricao={onSalvarTituloDescricao}
      onExcluir={onExcluir}
      onPassoAtualizado={onPassoAtualizado}
      onArrastarInicio={onArrastarInicio}
      onSoltarSobre={onSoltarSobre}
      emArraste={false}
      {...extras}
    />,
  );

  return { ...utilitarios, onSalvarTituloDescricao, onExcluir, onPassoAtualizado, onArrastarInicio, onSoltarSobre };
}

describe("PassoEditavel", () => {
  it("edita o título e salva ao perder o foco", async () => {
    const { onSalvarTituloDescricao } = renderizar();

    const campoTitulo = screen.getByLabelText("Título do passo 1");
    fireEvent.change(campoTitulo, { target: { value: "Título editado" } });
    fireEvent.blur(campoTitulo);

    expect(onSalvarTituloDescricao).toHaveBeenCalledWith("c1", "Título editado", "");
  });

  it("edita a descrição e salva ao perder o foco", async () => {
    const { onSalvarTituloDescricao } = renderizar();

    const campoDescricao = screen.getByLabelText("Descrição do passo 1");
    fireEvent.change(campoDescricao, { target: { value: "Nova descrição" } });
    fireEvent.blur(campoDescricao);

    expect(onSalvarTituloDescricao).toHaveBeenCalledWith("c1", "Clique em Salvar", "Nova descrição");
  });

  it("não chama onSalvarTituloDescricao se nada mudou", () => {
    const { onSalvarTituloDescricao } = renderizar();
    fireEvent.blur(screen.getByLabelText("Título do passo 1"));
    expect(onSalvarTituloDescricao).not.toHaveBeenCalled();
  });

  it("mostra 'Salvo' depois de salvar com sucesso", async () => {
    renderizar();
    const campoTitulo = screen.getByLabelText("Título do passo 1");
    fireEvent.change(campoTitulo, { target: { value: "Novo" } });
    fireEvent.blur(campoTitulo);
    expect(await screen.findByText("Salvo")).toBeInTheDocument();
  });

  it("mostra erro quando o salvamento falha", async () => {
    const onSalvarTituloDescricao = vi.fn().mockResolvedValue(false);
    render(
      <PassoEditavel
        sessaoId="s1"
        passo={passoBase()}
        onSalvarTituloDescricao={onSalvarTituloDescricao}
        onExcluir={vi.fn()}
        onPassoAtualizado={vi.fn()}
        onArrastarInicio={vi.fn()}
        onSoltarSobre={vi.fn()}
        emArraste={false}
      />,
    );
    const campoTitulo = screen.getByLabelText("Título do passo 1");
    fireEvent.change(campoTitulo, { target: { value: "Novo" } });
    fireEvent.blur(campoTitulo);
    expect(await screen.findByText("Não foi possível salvar")).toBeInTheDocument();
  });

  it("título não pode ficar vazio — some não bloqueia (desfaz e não salva)", () => {
    const { onSalvarTituloDescricao } = renderizar();
    const campoTitulo = screen.getByLabelText("Título do passo 1") as HTMLInputElement;
    fireEvent.change(campoTitulo, { target: { value: "   " } });
    fireEvent.blur(campoTitulo);
    expect(onSalvarTituloDescricao).not.toHaveBeenCalled();
    expect(campoTitulo.value).toBe("Clique em Salvar");
  });

  it("botão de excluir chama onExcluir com o correlacaoId", () => {
    const { onExcluir } = renderizar();
    fireEvent.click(screen.getByRole("button", { name: "Excluir passo Clique em Salvar" }));
    expect(onExcluir).toHaveBeenCalledWith("c1");
  });

  it("dragstart chama onArrastarInicio e drop chama onSoltarSobre", () => {
    const { container, onArrastarInicio, onSoltarSobre } = renderizar();
    const cartao = container.querySelector("[draggable='true']") as HTMLElement;

    fireEvent.dragStart(cartao);
    expect(onArrastarInicio).toHaveBeenCalledWith("p1");

    fireEvent.drop(cartao);
    expect(onSoltarSobre).toHaveBeenCalledWith("p1");
  });

  it("mostra a etiqueta de origem correta (Automático/Manual)", () => {
    renderizar({ origem: "manual" });
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("passo sem screenshot (manual) renderiza o placeholder, sem botão de editar imagem", () => {
    renderizar({ origem: "manual", imagemRedigida: undefined });
    expect(screen.getByText(/etapa manual — sem captura/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar imagem" })).not.toBeInTheDocument();
  });

  it("reutiliza o mesmo AreaCapturaPasso: passo com screenshot mostra 'Editar imagem'", () => {
    renderizar({ imagemRedigida: "data:image/png;base64,AAAA" });
    expect(screen.getByRole("button", { name: "Editar imagem" })).toBeInTheDocument();
  });

  it("preserva anotações da imagem existentes (badge com contagem)", () => {
    renderizar({
      imagemRedigida: "data:image/png;base64,AAAA",
      anotacoesImagem: [{ id: "a1", tipo: "destaque", geometria: { tipo: "retangulo", x: 1, y: 1, largura: 2, altura: 2 } }],
    });
    expect(screen.getByText(/1 anotação/)).toBeInTheDocument();
  });
});
