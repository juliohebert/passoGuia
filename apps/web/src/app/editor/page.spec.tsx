// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PassoGravado as Passo, ResumoSessao } from "@/dominio/tipos";

const SESSAO_ID = "sessao-1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams({ sessaoId: SESSAO_ID }),
}));

function resumo(sobrescritas: Partial<ResumoSessao> = {}): ResumoSessao {
  return {
    sessaoId: SESSAO_ID,
    nome: "Emitir nota fiscal de serviço",
    modo: "extensao",
    criadaEm: 1_700_000_000_000,
    totalPassos: 0,
    ...sobrescritas,
  };
}

const buscarSessao = vi.fn();
const carregarPassos = vi.fn();
const atualizarTituloDescricao = vi.fn();
const criarPassoManual = vi.fn();
const excluirPasso = vi.fn();
const reordenarPassos = vi.fn();

vi.mock("@/dados/api-gravacao", () => ({
  buscarSessao: (...args: unknown[]) => buscarSessao(...args),
  carregarPassos: (...args: unknown[]) => carregarPassos(...args),
  atualizarTituloDescricao: (...args: unknown[]) => atualizarTituloDescricao(...args),
  criarPassoManual: (...args: unknown[]) => criarPassoManual(...args),
  excluirPasso: (...args: unknown[]) => excluirPasso(...args),
  reordenarPassos: (...args: unknown[]) => reordenarPassos(...args),
}));

function passo(sobrescritas: Partial<Passo> = {}): Passo {
  return {
    id: `id-${sobrescritas.correlacaoId ?? "1"}`,
    correlacaoId: "c1",
    ordem: 1,
    titulo: "Passo",
    origem: "automatico",
    ...sobrescritas,
  };
}

describe("PaginaEditorManual", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sessão inexistente mostra um erro controlado (sem crashar)", async () => {
    buscarSessao.mockResolvedValue(null);
    const { default: PaginaEditorManual } = await import("./page");
    render(<PaginaEditorManual />);

    expect(await screen.findByText("Sessão não encontrada")).toBeInTheDocument();
    expect(carregarPassos).not.toHaveBeenCalled();
  });

  it("carrega e lista os passos da sessão", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos.mockResolvedValue([
      passo({ correlacaoId: "c1", ordem: 1, titulo: "Um" }),
      passo({ correlacaoId: "c2", ordem: 2, titulo: "Dois" }),
    ]);
    const { default: PaginaEditorManual } = await import("./page");
    render(<PaginaEditorManual />);

    expect(await screen.findByLabelText("Título do passo 1")).toHaveValue("Um");
    expect(screen.getByLabelText("Título do passo 2")).toHaveValue("Dois");
    expect(carregarPassos).toHaveBeenCalledWith(SESSAO_ID);
  });

  it("editar título/descrição chama a API com o sessaoId e reflete o retorno (persistência)", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos.mockResolvedValue([passo({ correlacaoId: "c1", titulo: "Original" })]);
    atualizarTituloDescricao.mockResolvedValue(passo({ correlacaoId: "c1", titulo: "Editado" }));
    const { default: PaginaEditorManual } = await import("./page");
    render(<PaginaEditorManual />);

    const campo = await screen.findByLabelText("Título do passo 1");
    fireEvent.change(campo, { target: { value: "Editado" } });
    fireEvent.blur(campo);

    await waitFor(() => {
      expect(atualizarTituloDescricao).toHaveBeenCalledWith(SESSAO_ID, "c1", "Editado", "");
    });
  });

  it("reordenar (soltar um passo sobre outro) chama a API com a nova ordem e atualiza a lista", async () => {
    buscarSessao.mockResolvedValue(resumo());
    const c1 = passo({ correlacaoId: "c1", ordem: 1, titulo: "Um" });
    const c2 = passo({ correlacaoId: "c2", ordem: 2, titulo: "Dois" });
    carregarPassos.mockResolvedValue([c1, c2]);
    reordenarPassos.mockResolvedValue([
      passo({ correlacaoId: "c2", ordem: 1, titulo: "Dois" }),
      passo({ correlacaoId: "c1", ordem: 2, titulo: "Um" }),
    ]);
    const { default: PaginaEditorManual } = await import("./page");
    const { container } = render(<PaginaEditorManual />);

    await screen.findByLabelText("Título do passo 1");
    const cartoes = container.querySelectorAll("[draggable='true']");
    expect(cartoes).toHaveLength(2);

    fireEvent.dragStart(cartoes[1] as HTMLElement); // arrasta "Dois" (c2)
    fireEvent.drop(cartoes[0] as HTMLElement); // solta sobre "Um" (c1)

    await waitFor(() => {
      expect(reordenarPassos).toHaveBeenCalledWith(SESSAO_ID, ["c2", "c1"]);
    });
    expect((await screen.findByLabelText("Título do passo 1")).getAttribute("value")).toBe("Dois");
  });

  it("excluir um passo chama a API e recarrega a lista sem ele", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos
      .mockResolvedValueOnce([
        passo({ correlacaoId: "c1", ordem: 1, titulo: "Um" }),
        passo({ correlacaoId: "c2", ordem: 2, titulo: "Dois" }),
      ])
      .mockResolvedValueOnce([passo({ correlacaoId: "c1", ordem: 1, titulo: "Um" })]);
    excluirPasso.mockResolvedValue(true);
    const { default: PaginaEditorManual } = await import("./page");
    render(<PaginaEditorManual />);

    await screen.findByLabelText("Título do passo 2");
    fireEvent.click(screen.getByRole("button", { name: "Excluir passo Dois" }));

    await waitFor(() => {
      expect(excluirPasso).toHaveBeenCalledWith(SESSAO_ID, "c2");
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("Título do passo 2")).not.toBeInTheDocument();
    });
  });

  it("adicionar etapa manual chama a API com o sessaoId e a nova etapa aparece na lista", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos.mockResolvedValue([]);
    criarPassoManual.mockResolvedValue(
      passo({ correlacaoId: "novo", ordem: 1, titulo: "Conferir valores", origem: "manual" }),
    );
    const { default: PaginaEditorManual } = await import("./page");
    render(<PaginaEditorManual />);

    await waitFor(() => {
      expect(screen.getByText(/Nenhum passo ainda/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Adicionar etapa manual/ }));
    fireEvent.change(screen.getByPlaceholderText("Ex.: Conferir os valores antes de emitir"), {
      target: { value: "Conferir valores" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar etapa" }));

    await waitFor(() => {
      expect(criarPassoManual).toHaveBeenCalledWith(SESSAO_ID, "Conferir valores", undefined);
    });
    expect(await screen.findByLabelText("Título do passo 1")).toHaveValue("Conferir valores");
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("passo manual sem screenshot é exibido corretamente (sem quebrar)", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos.mockResolvedValue([
      passo({ correlacaoId: "c1", titulo: "Manual sem imagem", origem: "manual", imagemRedigida: undefined }),
    ]);
    const { default: PaginaEditorManual } = await import("./page");
    render(<PaginaEditorManual />);

    await screen.findByLabelText("Título do passo 1");
    expect(screen.getByText(/etapa manual — sem captura/)).toBeInTheDocument();
  });

  it("preserva anotações da imagem já salvas ao carregar o editor", async () => {
    buscarSessao.mockResolvedValue(resumo());
    carregarPassos.mockResolvedValue([
      passo({
        correlacaoId: "c1",
        imagemRedigida: "data:image/png;base64,AAAA",
        anotacoesImagem: [
          { id: "a1", tipo: "seta", geometria: { tipo: "seta", x1: 0, y1: 0, x2: 10, y2: 10 } },
        ],
      }),
    ]);
    const { default: PaginaEditorManual } = await import("./page");
    render(<PaginaEditorManual />);

    await screen.findByLabelText("Título do passo 1");
    expect(screen.getByText(/1 anotação/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar imagem" })).toBeInTheDocument();
  });
});
